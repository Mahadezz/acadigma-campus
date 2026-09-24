# F-ID-09 — Audit viewer

|                  |                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | platform                                                                                                                                                                            |
| Status           | Parts 1-3 shipped (append-only substrate + catalogue, owner viewer, correlation/per-record history); Part 4 (export, platform viewer, integrity job) planned                        |
| Owner branch     | `feat/identity-audit`                                                                                                                                                               |
| Depends on       | F-ID-01, F-ID-03, F-ID-08                                                                                                                                                           |
| Plan             | `docs/plan/ROADMAP.md` chunk 3                                                                                                                                                      |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §5.2 D4; §5.3 W1, W5; `docs/reference/base44-security-review.md` finding 5; PRODUCT-DECISIONS §6.8; DECISION-LOG D-05 |

## 1. Purpose

A school holds children's records. The only acceptable answer to _"who changed this child's medical note, and when?"_ is a precise one, and the only way to give it is an append-only trail the application cannot skip and nobody can edit. This feature is the **reader** for that trail: a filterable, exportable viewer over `audit_events` for workspace owners (their own workspace) and platform staff (all workspaces), with a before/after diff for every change, a correlation view that groups one user action into the rows it produced, and an export fit to hand to an auditor or a school board. The writing side is a database concern defined in ARCHITECTURE §4 and DECISION-LOG D-05; this spec owns the surface, the guarantees it must be able to demonstrate, and the retention and privacy rules around it.

The Base44 prototype's audit trail was, in the security review's words, **not evidence**. It was written from the browser, best-effort, with failures reduced to a `console.warn` — an attacker simply does not call it. `AuditLog` had **no RLS block**, so rows were writable and deletable by anyone; the app proved it by calling `AuditLog.update(...)` and overwriting a prior entry in place, directly contradicting its own "read-only, no edit, no delete" comment. Both real call sites passed arguments in the **wrong order** (`logAudit('cover.override', user?.id, {...})` against a signature of `logAudit(user, action_type, entity_type, …)`), so the only two audit entries the system ever produced were garbage: `user_id: 'system'`, `school_id: 'unknown'`, and a UUID where the action name belonged (W1). Every row that did land wrote `school_id: user?.school_id || 'default'` against a field that does not exist on the user schema, collapsing every tenant into one bucket (W5). `logActivity()` had zero call sites, so the activity feed never fired at all (D4). And there was no viewer of any kind. This feature exists so that "we can tell you exactly who did that" is a true sentence.

## 2. Roles and permissions

| Action                                                                  | Workspace owner                             | Workspace admin              | Other members | Subject of the event | Platform staff                                        | Permission key        |
| ----------------------------------------------------------------------- | ------------------------------------------- | ---------------------------- | ------------- | -------------------- | ----------------------------------------------------- | --------------------- |
| Read the audit trail for their own workspace                            | ✅                                          | ❌ by default (see §11 OQ-2) | ❌            | —                    | ✅                                                    | `audit.read`          |
| Read the audit trail across all workspaces                              | —                                           | —                            | —             | —                    | ✅                                                    | `audit.read.platform` |
| Read account-level events about **themselves** (`workspace_id is null`) | ✅                                          | ✅                           | ✅            | ✅                   | ✅                                                    | `audit.read.self`     |
| Read `platform.support_read` rows touching their workspace              | ✅                                          | ✅                           | ❌            | —                    | ✅                                                    | `audit.read`          |
| Export the trail (CSV / JSON Lines)                                     | ✅                                          | ❌                           | ❌            | —                    | ✅                                                    | `audit.export`        |
| Write an audit event                                                    | ❌                                          | ❌                           | ❌            | ❌                   | ❌ — **triggers and SECURITY DEFINER functions only** | —                     |
| Update or delete an audit event                                         | ❌ **nobody, ever, in application context** |                              |               |                      |                                                       | —                     |

Two consequences worth stating plainly. First, a platform admin reading a workspace's trail is itself an audited act (`platform.audit_viewed`) — the watchers are watched. Second, an owner reading their trail sees actions taken by platform staff inside their workspace, including every read performed under a support grant (F-ID-08 §4.5); transparency runs both ways or it is not transparency.

## 3. Data

Tenant key: `audit_events.workspace_id`, **nullable** — account-level events (`account.registered`, `session.revoked`) and platform-level events (`platform.feature_flag_changed`) have no tenant. Columns follow ARCHITECTURE §4 and are **proposed; DATA-MODEL.md wins**.

### `audit_events`

| column              | type                               | notes                                                               |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `id`                | bigint identity PK                 | monotonic; cheaper than uuid for an append-only, time-ordered table |
| `workspace_id`      | uuid null FK workspaces            | null = account or platform scope                                    |
| `actor_id`          | uuid null FK profiles              | null for system/cron actors                                         |
| `actor_kind`        | enum `audit_actor`                 | `user \| platform_staff \| system \| webhook`                       |
| `action`            | text not null                      | dot-namespaced, e.g. `member.role_changed` (catalogue in §5.1)      |
| `table_name`        | text null                          | for trigger-written rows                                            |
| `row_id`            | uuid null                          | the affected row                                                    |
| `subject_user_id`   | uuid null                          | when the event is _about_ a person (role change, removal)           |
| `before`            | jsonb null                         | redacted per §5.3                                                   |
| `after`             | jsonb null                         | redacted per §5.3                                                   |
| `changed_fields`    | text[] null                        | generated from the diff; the primary thing a human reads            |
| `correlation_id`    | uuid null                          | one user action → many rows                                         |
| `request_ip_hash`   | text null                          | sha256(ip + daily salt); never the raw IP                           |
| `user_agent_family` | text null                          | "Chrome on Android", not the full UA string                         |
| `severity`          | enum `audit_severity`              | `info \| notable \| critical` — derived from the action catalogue   |
| `created_at`        | timestamptz not null default now() |                                                                     |

Indexes: `(workspace_id, created_at desc)`, `(workspace_id, action, created_at desc)`, `(actor_id, created_at desc)`, `(subject_user_id, created_at desc)`, `(correlation_id)`, `(table_name, row_id, created_at desc)` for per-record history, and a BRIN on `created_at` for the export path. Monthly partitioning is deferred until the table passes ~50M rows; the migration is written so partitioning is a later, non-breaking change.

### Writers

1. **The generic trigger** `app.audit_row_change()` attached to every tenant table (ARCHITECTURE §4), reading `actor_id` from `auth.uid()` and `workspace_id` / `correlation_id` from the transaction-local settings that `resolveWorkspaceContext` sets (F-ID-03 §4.3).
2. **`app.log_audit_event(...)`**, a SECURITY DEFINER function for events that are not a row change — sign-in, session revocation, an export, a support read, a feature-flag change, a broadcast. This is the addition ARCHITECTURE §4 does not currently describe (§11 OQ-1).

### Grants and RLS, in words

- **`revoke insert, update, delete on audit_events from anon, authenticated, service_role`** at the migration level. The table is written only by functions that are `SECURITY DEFINER` and owned by a role that holds the grant — so even the service role used by webhooks and cron cannot edit history, only append through the function. This is the structural answer to the prototype's `AuditLog.update(...)`.
- **select**: `app.has_role(workspace_id,'{owner}')` for workspace-scoped rows; **or** `actor_id = app.current_user_id() and workspace_id is null` (your own account events); **or** `subject_user_id = app.current_user_id()` (events about you — a teacher can always see that they were removed and by whom); **or** `app.is_platform_admin()`.
- A **redaction view** `audit_events_view` is what every client reads. It applies the §5.3 rules at read time, so the base table can hold what a forensic export needs while a screen never renders a phone number or a diary line.
- No policy grants a workspace **admin** read by default (§11 OQ-2).

### Retention

Retained **indefinitely** (ARCHITECTURE §10, PRODUCT-DECISIONS §6.8). Account purge (F-ID-01 §4.9) explicitly does **not** delete audit rows; it anonymises `profiles` while `actor_id` remains a valid foreign key to the anonymised row, so history stays attributable without holding the deleted person's name. Rows older than 24 months move to a cold partition and remain queryable through the export path.

Private files: none. Exports are written to the `private` bucket and delivered by 5-minute signed URL, logged to `file_access_log`.

## 4. Workflows

### 4.1 Read the trail — owner

**Route:** `/app/settings/audit`. Reachable from Settings → Security & audit, and from the "History" affordance on individual records (§4.4).

**Phone:** a sticky filter bar (a date-range chip, a category chip, a search field), then a reverse-chronological list of 80 px rows: a severity icon, a one-sentence plain-language summary, the actor's name and avatar, and a relative time. Tapping a row opens a full-height detail sheet. Infinite scroll, 30 per page, cursor-paginated.

**Desktop:** the same data as a table (Time · Actor · Action · Subject · Changed fields) with the detail in a right-hand panel and the filters inline.

The list renders **sentences, not raw action strings**: "Nusrat Jahan changed Rahim Uddin's role from Teacher to Admin", not `member.role_changed`. The raw action, table and row id are in the detail sheet for anyone who needs them.

**Audit:** reading your own workspace's trail as an owner is **not** itself audited — it would double the table's growth for no safety gain. Exporting is.

### 4.2 Filter and search

Filters, all applied server-side: date range (presets: today, 7 days, 30 days, custom), actor (a searchable member picker), action category (People, Settings, Academics, Billing, Files, Security, Platform), severity, subject person, table, and a free-text search over `changed_fields` and the rendered summary. Filters compose into a shareable URL so an owner can send a colleague the exact view — the link carries no data, only the query.

**Failure case:** a filter combination yielding nothing renders "No events match these filters" with a one-tap Clear, never an empty page that looks broken.

### 4.3 Event detail and diff

The detail sheet shows: the sentence, the exact timestamp in the workspace timezone plus UTC, the actor (name, role at the time, device family, hashed-IP region), the action and severity, the affected table and row with a link to the record if it still exists, `changed_fields` as a list, and a **before/after diff** rendered field by field — redacted values shown as `••••` with a "Why is this hidden?" link explaining §5.3.

At the bottom: **"Show everything from this action"** — the correlation view, listing every row sharing `correlation_id` in order. This is what makes a compound action legible: creating a school produced eight rows; approving a member produced two; a support read produced one per record touched.

### 4.4 Per-record history

Any record with a history worth reading — a student, a mark, a membership, a workspace setting, a file — gets a "History" action in its detail screen that opens the audit viewer pre-filtered to `(table_name, row_id)`. The owning areas add the affordance; this feature provides the route and the component. This is the screen that answers the question about the child's medical note in two taps.

### 4.5 Export

**Trigger:** the viewer's Export action (owners and platform staff only).

1. A sheet confirms the current filter set, the row count and the format (CSV or JSON Lines). Exports above 50,000 rows are queued rather than streamed.
2. `exportAuditEvents` enqueues a `jobs` row; the job streams from the redaction view, writes to the `private` bucket, and notifies the requester when ready (`audit.export_ready`).
3. The file downloads through `/api/files/[id]` with a 5-minute signed URL and expires from storage after 7 days.
4. **The export itself is audited** (`audit.exported`, severity `notable`) with the filter set and the row count — because exporting the trail is exactly the action an insider takes before doing something else.

**Failure cases:** a job failure retries three times then notifies with a support link; a second export requested while one is running for the same user returns the in-progress one rather than starting another.

### 4.6 Platform staff view

**Route:** `/platform/audit` (F-ID-08's More menu, and embedded read-only in the workspace inspector's Activity tab).

Identical UI with two additions: a workspace filter (searchable; either "all" or one specific workspace — no partial multi-select, to keep queries indexed), and an `actor_kind` filter for reviewing the team's own actions. Opening the platform viewer writes `platform.audit_viewed`; exporting writes `audit.exported` with `actor_kind='platform_staff'`.

### 4.7 Integrity self-check

A weekly job verifies that `audit_events` has no gaps in its identity sequence beyond expected transaction aborts, that no row's `created_at` precedes its predecessor by more than clock skew, and that the table's privileges are still revoked as expected. Any anomaly raises a platform-console alert. Cheap insurance that turns "append-only" from an assertion into something checked.

## 5. Business rules and calculations

### 5.1 Action catalogue (this area's contributions)

Actions are `{domain}.{action}`, stable forever, each with a severity and a sentence template. The catalogue lives in `app.audit_action_catalog` (seeded by migration) and is mirrored in `packages/contracts/src/audit/catalog.ts`; **a CI test fails if a migration or a call site uses an action absent from the catalogue** — the mechanism preventing the prototype's garbage-action problem from recurring.

| Action                                                                                   | Severity       | Sentence template                                                 |
| ---------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `account.registered` · `account.email_verified`                                          | info           | "{actor} created an account"                                      |
| `account.password_reset` · `account.password_changed`                                    | notable        | "{actor} changed their password"                                  |
| `account.deletion_requested` · `.cancelled` · `.purged`                                  | critical       | "{actor} scheduled their account for deletion"                    |
| `session.revoked` · `session.revoked_all`                                                | notable        | "{actor} signed out {n} devices"                                  |
| `profile.updated` · `preferences.updated`                                                | info           | "{actor} updated their profile ({fields})"                        |
| `workspace.created` · `.updated` · `.archived`                                           | notable        | "{actor} created {workspace}"                                     |
| `school_profile.created` · `.updated`                                                    | notable        | "{actor} changed school settings ({fields})"                      |
| `workspace.ownership_transferred`                                                        | critical       | "{actor} transferred ownership to {subject}"                      |
| `workspace.module_visibility_changed`                                                    | notable        | "{actor} hid the {module} module"                                 |
| `member.invited` · `.invitation_resent` · `.invitation_revoked` · `.invitation_accepted` | info / notable | "{actor} invited {masked_recipient} as {role}"                    |
| `member.join_requested` · `.approved` · `.rejected`                                      | notable        | "{actor} approved {subject}'s request to join"                    |
| `member.role_changed`                                                                    | critical       | "{actor} changed {subject}'s role from {before} to {after}"       |
| `member.staff_fields_updated` · `.label_assigned`                                        | info           | "{actor} updated {subject}'s staff details ({fields})"            |
| `member.removed` · `.left`                                                               | critical       | "{actor} removed {subject} from {workspace}"                      |
| `join_code.created` · `.rotated` · `.disabled`                                           | notable        | "{actor} rotated the join code"                                   |
| `label.created` · `.updated` · `.deleted`                                                | info           | "{actor} created the label {name}"                                |
| `guardian.invited` · `.linked`                                                           | notable        | "{actor} linked {subject} to {student}"                           |
| `document_request.created` · `.approved` · `.declined` · `.revoked` · `.expired`         | critical       | "{subject} approved a document request from {workspace}"          |
| `file.uploaded` · `.deleted`                                                             | info           | "{actor} uploaded {name}"                                         |
| `file.downloaded` (private files, mirrored from `file_access_log`)                       | notable        | "{actor} downloaded {name}"                                       |
| `personal_student.*` · `diary_entry.*` · `personal_attendance.saved`                     | info           | "{actor} saved attendance for {date} ({n} students)"              |
| `teacher_profile.updated` · `.open_to_work_changed`                                      | notable        | "{actor} turned Open to work {after}"                             |
| `tenancy.context_rejected`                                                               | critical       | "A request tried to use workspace {id} without membership"        |
| `platform.console_opened` · `.workspace_viewed` · `.person_looked_up`                    | info           | "{actor} (Acadigma) viewed this workspace"                        |
| `platform.support_read`                                                                  | critical       | "{actor} (Acadigma) read {table} under a support grant"           |
| `platform.workspace_suspended` · `.reinstated`                                           | critical       | "{actor} (Acadigma) suspended this workspace — {reason}"          |
| `platform.feature_flag_changed` · `.plan_updated` · `.settings_changed`                  | notable        | "{actor} (Acadigma) changed the flag {key} to {after} — {reason}" |
| `platform.broadcast_sent` · `.audit_viewed`                                              | info           | —                                                                 |
| `audit.exported`                                                                         | notable        | "{actor} exported {n} audit events"                               |

Every other area appends its own rows to the catalogue by migration.

### 5.2 Other rules

| Rule                   | Value                                                                                                                                                | Where                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Write path             | triggers + `app.log_audit_event` only; **no application-code insert**                                                                                | migration grants + Semgrep rule   |
| Mutability             | no UPDATE or DELETE grant to any role in application context                                                                                         | migration                         |
| Actor resolution       | `auth.uid()`; null for cron/webhook with `actor_kind` set accordingly; **never** a client-supplied id                                                | trigger                           |
| Correlation            | `app.correlation_id` transaction setting, generated per request by the middleware and returned in the `x-correlation-id` response header for support | F-ID-03 §4.3                      |
| Severity               | derived from the catalogue; never supplied by the caller                                                                                             | `app.audit_action_catalog`        |
| Sentence rendering     | server-side from the template + `before`/`after`, in the reader's language                                                                           | `packages/domain/audit/render.ts` |
| `changed_fields`       | computed in the trigger as the set of keys whose values differ between `before` and `after`                                                          | `app.audit_row_change()`          |
| Ordering               | by `id` desc, not `created_at` desc — two rows in one transaction share a timestamp                                                                  | repository                        |
| Pagination             | cursor on `(created_at, id)`; never OFFSET                                                                                                           | repository                        |
| Export size            | ≤ 50,000 rows streamed inline; above that, queued; hard cap 2,000,000 rows per export                                                                | `packages/domain/audit/export.ts` |
| Export retention       | 7 days in the `private` bucket, then swept                                                                                                           | nightly job                       |
| Event retention        | indefinite; account purge anonymises the profile and keeps the rows                                                                                  | F-ID-01 §4.9                      |
| Clock                  | displayed in the workspace timezone with UTC alongside in the detail                                                                                 | `packages/domain/time/today.ts`   |
| Reading is not audited | except platform-staff reads and every export                                                                                                         | §4.1, §4.6                        |

### 5.3 Redaction

The trail must be usable without becoming a second copy of the data it describes.

| Class                                                                                | Rule                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free-text content (diary bodies, student notes, message bodies, invitation messages) | **field names only** — `before`/`after` store `null` for these columns and the field name appears in `changed_fields`                                                                             |
| Personal contact data (email, phone)                                                 | masked at write time (`r***@gmail.com`, `+8801*****678`)                                                                                                                                          |
| Identity documents, file contents, storage paths                                     | never stored; only the file id and display name                                                                                                                                                   |
| Secrets (tokens, password hashes, payout account numbers, API keys)                  | never written; a trigger-level deny-list drops these columns before insert, and a test asserts the deny-list covers every column matching `%token%`, `%secret%`, `%password%`, `%account_number%` |
| Health and medical fields on student records                                         | field names only                                                                                                                                                                                  |
| Money, roles, statuses, dates, ids, settings                                         | stored in full — these are the values an audit exists to prove                                                                                                                                    |
| Raw IP                                                                               | never; `sha256(ip + daily salt)` only                                                                                                                                                             |

## 6. UI

Components: `AuditFilterBar`, `AuditList`, `AuditRow`, `AuditDetailSheet`, `DiffView`, `CorrelationList`, `DateRangeChip`, `PersonPicker`, `DataList`, `EmptyState`, `Skeleton`, `ExportSheet`, `Banner`.

| Screen / route                       | 360×800                                                                                                                                                                                             | ≥1024                                                                                           | Primary action                   | Empty                                           | Loading                                               | Error                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Owner viewer — `/app/settings/audit` | Sticky filter bar (date chip · category chip · search); 80 px rows with a severity dot, the sentence over two lines, actor avatar and relative time; infinite scroll; Export in the header overflow | Filters inline above a 5-column table; detail in a 480 px right panel; pagination at the bottom | Filter                           | "No events match these filters" + Clear filters | 8 row skeletons                                       | List-level alert with retry; already-loaded rows preserved    |
| Detail — sheet / panel               | Full-height sheet: sentence, timestamp block, actor block, action + severity chips, changed-fields list, `DiffView`, "Show everything from this action" at the bottom                               | Right panel, same order, diff in two columns                                                    | Show everything from this action | n/a                                             | skeleton                                              | inline; a deleted target shows "This record no longer exists" |
| Diff                                 | Stacked field rows: label, before (strikethrough, muted), after (emphasised); redacted values as `••••` with a help link                                                                            | Side-by-side columns                                                                            | —                                | "Nothing changed" (a no-op update)              | —                                                     | —                                                             |
| Correlation view                     | A vertical numbered timeline of the rows sharing the id, each tappable                                                                                                                              | Same in the panel                                                                               | —                                | n/a                                             | skeleton                                              | inline                                                        |
| Per-record history                   | The same viewer as a sheet, pre-filtered, with the record's name in the header and the filter chip locked                                                                                           | Panel or dialog                                                                                 | —                                | "No changes recorded yet"                       | skeleton                                              | inline                                                        |
| Export — sheet                       | Confirms the filter summary and row count; format radio (CSV / JSON Lines); a warning above 50,000 rows that it will be delivered when ready                                                        | Dialog at 480 px                                                                                | Export                           | n/a                                             | Button spinner; queued exports show a progress banner | inline; a queued failure notifies with retry                  |
| Platform viewer — `/platform/audit`  | Adds a workspace picker as the first filter chip and an actor-kind chip; otherwise identical                                                                                                        | Identical plus a workspace column                                                               | Filter                           | "Pick a workspace or choose All"                | skeletons                                             | inline                                                        |
| Activity tab (inspector embed)       | Last 200 events, read-only, with "Open full history"                                                                                                                                                | Same at 960 px                                                                                  | Open full history                | "No activity recorded"                          | skeletons                                             | inline                                                        |

Accessibility: rows are links whose accessible name is the full sentence (not "row 4"); the severity dot is always accompanied by text; the diff uses `<del>`/`<ins>` so a screen reader announces before and after; the filter bar is a labelled form region; redacted values announce as "hidden for privacy".

## 7. Server contracts

Schemas in `packages/contracts/src/audit/*.ts`. Actions in `apps/web/app/(school)/app/settings/audit/actions.ts` and `apps/web/app/(platform)/platform/audit/actions.ts`.

| Action / handler                                   | Input schema                                                                                                                                                         | Output                                                                         | Errors                                                | Idempotency            | Rate limit          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------- | ------------------- |
| `listAuditEvents`                                  | `ListAuditEventsInput` {workspace_id?, from?, to?, actor_id?, subject_user_id?, action_prefix?, category?, severity?, table_name?, row_id?, q?, cursor?, limit ≤ 50} | `Paginated<AuditEventDto>` (sentence rendered, values redacted)                | `FORBIDDEN`, `VALIDATION`                             | n/a                    | 120/min             |
| `getAuditEvent`                                    | `GetAuditEventInput` {id}                                                                                                                                            | `AuditEventDetailDto` {…, before, after, changed_fields, actor, target_exists} | `FORBIDDEN`, `NOT_FOUND`                              | n/a                    | 120/min             |
| `listCorrelatedEvents`                             | `CorrelationInput` {correlation_id, limit ≤ 200}                                                                                                                     | `AuditEventDto[]`                                                              | `FORBIDDEN`, `NOT_FOUND`                              | n/a                    | 60/min              |
| `getRecordHistory`                                 | `RecordHistoryInput` {table_name, row_id, cursor?, limit ≤ 50}                                                                                                       | `Paginated<AuditEventDto>`                                                     | `FORBIDDEN`                                           | n/a                    | 120/min             |
| `countAuditEvents`                                 | `CountAuditEventsInput` (same filters)                                                                                                                               | `{ count, is_estimate }`                                                       | `FORBIDDEN`                                           | n/a                    | 60/min              |
| `exportAuditEvents`                                | `ExportAuditEventsInput` {filters: ListAuditEventsInput, format: 'csv'\|'jsonl', idempotency_key}                                                                    | `{ mode: 'inline', file_id } \| { mode: 'queued', job_id }`                    | `FORBIDDEN`, `EXPORT_TOO_LARGE`, `EXPORT_IN_PROGRESS` | key required           | 10/day per user     |
| `getExportStatus`                                  | `ExportStatusInput` {job_id}                                                                                                                                         | `{ status, file_id?, row_count?, error? }`                                     | `NOT_FOUND`                                           | n/a                    | 120/min             |
| `GET /api/files/[id]`                              | —                                                                                                                                                                    | 302 to a 5-minute signed URL                                                   | `FORBIDDEN`                                           | n/a                    | shared with F-ID-06 |
| `POST /api/jobs/audit/export` (worker)             | —                                                                                                                                                                    | `{ exported }`                                                                 | —                                                     | idempotent per job row | every minute        |
| `POST /api/jobs/audit/integrity` (cron)            | —                                                                                                                                                                    | `{ ok, anomalies }`                                                            | —                                                     | idempotent             | weekly              |
| `app.log_audit_event(...)` (SQL, SECURITY DEFINER) | —                                                                                                                                                                    | `bigint`                                                                       | raises on an action absent from the catalogue         | —                      | —                   |

`AuditEventDto` is produced from `audit_events_view`; a CI test asserts the DTO cannot carry a column excluded by §5.3.

## 8. Parts (build chunks)

**Part 1 — Append-only substrate and the action catalogue** · Migration for `audit_events` (columns, enums, indexes), the `app.audit_row_change()` generic trigger and its attachment to every tenant table shipped so far, `app.log_audit_event`, the `app.audit_action_catalog` seed, the redaction deny-list and free-text rules, revoked INSERT/UPDATE/DELETE grants, the contracts mirror and the catalogue-parity CI test. · Files: `supabase/migrations/*_audit_events.sql`, `packages/contracts/src/audit/catalog.ts`. · Tests: pgTAP — `authenticated` and `service_role` cannot insert, update or delete; an update on an existing row fails for every role; a trigger-written row carries the right `actor_id`, `workspace_id` and `correlation_id`; the deny-list drops a `token` column; free-text columns store null with the field name present in `changed_fields`. · **Demo:** in psql, change a member's role and show one correctly attributed row; then try to edit or delete it as every role and fail each time.

**Part 2 — Owner viewer: list, filters, detail, diff** · `/app/settings/audit`, `listAuditEvents` with server-side filters and cursor pagination, the sentence renderer with `en`/`bn` catalogues, `getAuditEvent`, the detail sheet and `DiffView` with redaction affordances, empty and error states. · Tests: RLS integration (an owner sees only their workspace; a teacher sees only events about themselves; an admin sees none by default); filter and pagination integration tests; renderer unit tests for every catalogue template in both languages; axe. · **Demo:** on a phone, an owner filters to "People, last 7 days" and reads "Nusrat changed Rahim's role from Teacher to Admin" with the before/after diff.

**Part 3 — Correlation view and per-record history** · `listCorrelatedEvents`, the correlation timeline, `getRecordHistory` and the reusable pre-filtered viewer sheet, the "History" affordance contract other areas plug into. · Tests: creating a school produces one correlation group containing all eight rows in order; a per-record history test on a membership row across approve → role change → removal. · **Demo:** open a student record's History, see every change, tap one and see everything else that happened in the same action.

**Part 4 — Export, platform viewer and integrity job** · `exportAuditEvents` (inline and queued), the export job streaming from the redaction view to the `private` bucket, the `audit.export_ready` notification, signed-URL download and 7-day sweep, `/platform/audit` with workspace and actor-kind filters, `platform.audit_viewed`, the weekly integrity job and its console alert. · Tests: export row-count and redaction assertions on the produced file; `EXPORT_TOO_LARGE` and `EXPORT_IN_PROGRESS`; an audit test that the export is itself audited; platform-read auditing; an integrity-job test with an injected anomaly. · **Demo:** export 30 days as CSV on a phone, receive the notification, download it, and show the export appearing in the trail as its own event.

## 9. Acceptance criteria

1. **Given** any role in application context — `anon`, `authenticated` or `service_role` — **when** an INSERT, UPDATE or DELETE on `audit_events` is attempted directly, **then** it is rejected; rows appear only via the trigger or `app.log_audit_event`.
2. **Given** an existing audit row, **when** any actor attempts to modify it, **then** the attempt fails — the prototype's in-place `AuditLog.update(...)` has no equivalent here.
3. **Given** a member's role change, **when** the audit row is written, **then** `actor_id` is the acting user (never a client-supplied value), `workspace_id` is the correct tenant, `action` is `member.role_changed`, `before`/`after` carry the two roles, and `severity` is `critical`.
4. **Given** the creation of a school (eight inserts in one transaction), **when** the correlation view is opened from any of its rows, **then** all eight rows are listed in order under one `correlation_id`.
5. **Given** an owner of workspace A, **when** they open the viewer, **then** they see only workspace A's rows plus account events about themselves; workspace B's rows return zero.
6. **Given** a teacher, **when** they query `audit_events`, **then** they see only rows where they are the actor on an account-level event or the subject — for example, their own removal, with the actor's name.
7. **Given** a workspace admin with no explicit grant, **when** they open `/app/settings/audit`, **then** they receive `FORBIDDEN` (default per §11 OQ-2).
8. **Given** a diary entry edit, **when** the audit row is inspected, **then** `changed_fields` contains `body` and `before`/`after` contain **no** entry text.
9. **Given** any column whose name matches the secret deny-list, **when** a row change is audited, **then** that column appears in neither `before` nor `after`, and the CI test asserting deny-list coverage passes.
10. **Given** a member invitation, **when** the audit row is read, **then** the recipient appears masked (`r***@gmail.com`) and no invitation token material is present anywhere in the row.
11. **Given** platform staff reading under a support grant, **when** the workspace owner opens their audit viewer, **then** they see one `platform.support_read` row per record touched, attributed to the named staff member.
12. **Given** platform staff opening `/platform/audit`, **when** the page loads, **then** a `platform.audit_viewed` row is written — reading the trail as staff is itself audited.
13. **Given** an export of 12,000 rows, **when** it completes, **then** the file contains 12,000 redacted rows, an `audit.exported` row records the filter set and count, and the download is served by a 5-minute signed URL logged to `file_access_log`.
14. **Given** an export request above 2,000,000 rows, **when** it is submitted, **then** `EXPORT_TOO_LARGE` is returned with guidance to narrow the date range.
15. **Given** a second export request while one is running for the same user, **when** it is submitted, **then** the in-progress job is returned rather than a second one starting.
16. **Given** an account that has been purged, **when** its historical audit rows are read, **then** the rows still exist and resolve to "Deleted user" without exposing the deleted person's name or email.
17. **Given** a call site using an action string absent from `app.audit_action_catalog`, **when** CI runs, **then** the catalogue-parity test fails.
18. **Given** a user with `language='bn'`, **when** they read the trail, **then** every sentence renders in Bangla from the same catalogue templates.
19. **Given** the viewer at 360×800, **when** an owner filters and opens a detail sheet, **then** every control is thumb-reachable, axe reports no serious or critical issues, and the diff is announced with before/after semantics.
20. **Given** the question "who changed this student's medical note and when", **when** an owner opens that student's History, **then** the answer is on screen within two taps, with the actor, the timestamp in the school's timezone, and the changed field names.

## 10. Tests

- **Unit:** sentence rendering for every catalogue entry in `en` and `bn` with fixture payloads; `changed_fields` diffing (added, removed, changed, no-op); redaction classification for every column class in §5.3; export chunking and size thresholds; cursor construction on `(created_at, id)`.
- **DB (pgTAP):** grants revoked for insert/update/delete across all roles; trigger attribution (actor, workspace, correlation) under a normal request and under a cron/service-role context; select policies for owner / admin / teacher / subject / platform staff / anonymous; the redaction view never exposes a denied column; free-text nulling; the secret deny-list; two rows in one transaction share `correlation_id` and order correctly by `id`; index usage on the four primary filter combinations (asserted via `EXPLAIN`).
- **Integration:** every action in §7 for happy path and named errors; export idempotency replay; the export job's output parsed and asserted row-for-row; the integrity job with an injected anomaly raising an alert.
- **E2E (360×800 and 1280×800):** `owner-reads-role-change`, `per-record-history-two-taps`, `correlation-group-for-school-creation`, `export-csv-and-download`, `support-read-visible-to-owner` (two accounts), `platform-audit-view-is-audited`.
- **A11y:** axe on the viewer, detail sheet, diff and export sheet; the diff uses `<del>`/`<ins>`; severity is never colour-only; redacted values announce their reason.
- **Performance budgets:** `listAuditEvents` p95 ≤ 250 ms at 5,000,000 rows with any single filter and ≤ 400 ms with three; `countAuditEvents` returns an estimate above 100,000 rather than a slow exact count; the export job streams at ≥ 20,000 rows/s; the trigger adds ≤ 1 ms to a tenant write (measured against a baseline insert).
- **Security:** a Semgrep rule forbidding `insert into audit_events` and any `audit_events` update or delete in application code; a test that no DTO or log line contains a value from a redacted class; a test that the trail survives an account purge.

## 11. Open questions

- **OQ-1 (conflict with ARCHITECTURE §4): non-row-change events need a writer, and `workspace_id` must be nullable.** ARCHITECTURE §4 describes `audit_events` as "filled by a generic trigger on every tenant table", but sign-in, session revocation, exports, support reads, feature-flag changes and broadcasts are not row changes on tenant tables. **Default assumed:** add `app.log_audit_event(...)` as a SECURITY DEFINER writer and make `workspace_id` nullable. This still satisfies D-05 ("written by the database, not the client") because no application role holds an insert grant. ARCHITECTURE §4 should be amended and a DECISION-LOG entry recorded.
- **OQ-2: should workspace admins read the audit trail?** PRODUCT-DECISIONS §6.8 grants it to "owners (own workspace) and platform staff" and does not mention admins. **Default assumed:** owners only, because in a Bangladeshi school the admin role is often held by several office staff and the trail names who looked at what. A per-workspace setting ("Let admins read the audit trail") is the obvious escape hatch if schools ask; specified, not built.
- **OQ-3: tamper-evidence beyond grants.** A hash chain (`prev_hash`/`row_hash`) would make undetected tampering by anyone with direct database access impossible rather than merely difficult. **Default assumed:** not in v1 — revoked grants plus the weekly integrity job are proportionate; the columns are reserved so it can be added without a rewrite.
- **OQ-4: file downloads in the trail.** `file_access_log` (ARCHITECTURE §4) and `audit_events` overlap for private-file reads. **Default assumed:** `file_access_log` stays the high-volume detail table with a 1-year retention, and only **private** file downloads are mirrored into `audit_events` as `file.downloaded`. DATA-MODEL to confirm the duplication is acceptable.
- **OQ-5: retention vs. the right to erasure.** Audit rows survive account purge by design (F-ID-01 §4.9). **Default assumed:** stated in the deletion screen's fine print, and the correct trade for a system holding children's records; if a jurisdiction requires otherwise, `actor_id` is already nullable and can be severed without losing the event.
- **OQ-6: cross-area catalogue ownership.** **Default assumed:** every area's spec appends its actions to `app.audit_action_catalog` by migration and the parity test enforces it — the same contract as the notification catalogue in F-ID-07 §5.1.
