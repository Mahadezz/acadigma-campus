# F-ID-08 — Platform console shell

|                  |                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | platform                                                                                                                                                                         |
| Status           | planned                                                                                                                                                                          |
| Owner branch     | `feat/identity-platform-console`                                                                                                                                                 |
| Depends on       | F-ID-01, F-ID-03, F-ID-07                                                                                                                                                        |
| Plan             | `docs/plan/ROADMAP.md` chunk 3                                                                                                                                                   |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §3 rows 34, 37; §5.1 B9, B12; §5.3 W5; `docs/reference/base44-security-review.md` findings 3, 5; DECISION-LOG D-16 |

## 1. Purpose

Acadigma's own staff need one place to run the platform: see the schools on it, answer a support ticket without guessing, turn a risky feature off for one workspace, edit the plan matrix without a deploy, and reach the queues that other areas own (listing moderation, KYC, payouts, refunds). This feature builds the **shell** — the `/platform` route group, the `is_platform_admin` boundary, the schools list and workspace inspector, the support tooling (which deliberately contains **no impersonation**), feature flags, the plans-editor entry point, and platform-wide broadcasts. The queues themselves are specified by the marketplace and billing areas; this spec owns the door they hang behind. "Done" from the user's chair: a support engineer gets "our school can't send invitations", finds the workspace in three taps, sees its plan, seat counts, feature flags and recent audit summary, spots that the school hit its seat limit, and answers — without ever having read a student record.

The Base44 prototype had no platform console at all. What it had instead is the reason this one exists: the moderation and verification promises were made in the UI with nothing behind them ("We'll review within 24–48 hours" — B9, with no reviewer queue anywhere), the plan cards on the profile page were hardcoded with dead Upgrade buttons (B12), `IdentityVerification` — government ID scans and selfies — had **no RLS block at all** while its own schema comment said "INTERNAL ONLY" (security review finding 3), and every audit row and notification collapsed into one `'default'` pseudo-tenant (W5). A platform console built on top of that model would have been a cross-tenant reading machine. This one is built on the opposite principle: **platform staff get breadth, not depth** — they can see every workspace's shape, and almost none of its content.

## 2. Roles and permissions

Access is gated on **one boolean**: `profiles.is_platform_admin` (PRODUCT-DECISIONS §1.21). It grants `/platform` and nothing else — it never implies membership of any workspace, and it is never settable through the application (F-ID-01 §3: a trigger rejects self-update; the only writer is a reviewed migration or a service-role script).

| Action                                                                                         | Platform staff                   | Workspace owner        | Anyone else | Permission key                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------- | ----------- | ------------------------------------------------------------------------------- |
| Open `/platform`                                                                               | ✅                               | ❌                     | ❌          | `platform.console.access`                                                       |
| List / search all workspaces                                                                   | ✅                               | —                      | ❌          | `platform.workspace.read`                                                       |
| Open a workspace inspector (metadata, counts, plan, flags)                                     | ✅                               | own only, via settings | ❌          | `platform.workspace.read`                                                       |
| Read a workspace's tenant **content** (students, marks, files, messages, notifications, diary) | ❌ **by default**                | ✅ per their role      | ❌          | —                                                                               |
| Read tenant content under an owner-granted support grant                                       | ✅ time-boxed, read-only, logged | grants it              | ❌          | `platform.support.read`                                                         |
| Suspend / reinstate a workspace                                                                | ✅                               | ❌                     | ❌          | `platform.workspace.suspend`                                                    |
| Release an EIIN from an archived workspace                                                     | ✅                               | ❌                     | ❌          | `platform.workspace.write`                                                      |
| Suspend / reinstate a user account                                                             | ✅                               | ❌                     | ❌          | `platform.account.suspend`                                                      |
| Force sign-out of a user                                                                       | ✅                               | ❌                     | ❌          | `platform.session.revoke`                                                       |
| Grant / revoke `is_platform_admin`                                                             | ❌ (migration only)              | ❌                     | ❌          | —                                                                               |
| Create / edit feature flags and overrides                                                      | ✅                               | ❌                     | ❌          | `platform.flags.write`                                                          |
| Edit the plans matrix                                                                          | ✅                               | ❌                     | ❌          | `platform.plans.write`                                                          |
| Edit `platform_settings` (commission bps, payout minimum, hold days, SLA copy)                 | ✅                               | ❌                     | ❌          | `platform.settings.write`                                                       |
| Send a platform broadcast                                                                      | ✅                               | ❌                     | ❌          | `platform.broadcast.send`                                                       |
| Write a support note on a workspace                                                            | ✅                               | ❌                     | ❌          | `platform.support.write`                                                        |
| Open the moderation / KYC / payout / refund queues                                             | ✅                               | ❌                     | ❌          | `platform.queues.access` (queues themselves specified by marketplace + billing) |
| Read the cross-workspace audit viewer                                                          | ✅                               | own workspace only     | ❌          | `audit.read.platform` (F-ID-09)                                                 |

**There is no impersonation.** No "log in as this user", no session minting, no role borrowing. The alternatives — a metadata-rich inspector, an owner-granted read-only support grant, and the audit viewer — cover every real support case without ever producing a session that looks like someone else's. This is a deliberate, recorded product constraint, not an omission.

## 3. Data

Tenant key: platform tables are **not** workspace-scoped; `feature_flag_overrides`, `platform_support_notes` and `support_access_grants` carry a `workspace_id` as a _target_, not a tenant key. Columns **proposed; DATA-MODEL.md wins**.

### `platform_settings`

Single-row table (`id` check = 1): `commission_bps int default 3000` (PRODUCT-DECISIONS §4.3) · `payout_minimum_paisa bigint default 100000` · `payout_hold_days int default 7` · `kyc_sla_business_days int default 2` · `listing_review_sla_hours int` · `support_email`, `support_phone` · `maintenance_banner jsonb` · `updated_by`, `updated_at`. Read by any authenticated user through a narrow view (`platform_settings_public`: SLA copy and support contacts only); written only by platform staff.

### `feature_flags`

`key text PK` (`auth.phone_otp`, `invites.sms`, `marketplace.checkout`, `ai.syllabus_extraction`, …) · `description` · `scope enum(global|workspace)` · `default_enabled boolean` · `is_kill_switch boolean` (a kill switch can only be turned **off** faster than a deploy, never silently on) · `owner_area text` · `created_at`, `updated_at`, `updated_by`.

### `feature_flag_overrides`

`id` · `flag_key FK` · `workspace_id` null (null + `scope='global'` = the global override) · `enabled boolean` · `reason text not null` · `expires_at` null · `set_by`, `set_at`. Unique `(flag_key, coalesce(workspace_id, '0000…'))`. `reason` is `not null` on purpose — a flag flipped without a stated reason is an unexplained production change.

### `platform_support_notes`

`id` · `workspace_id` · `author_id` · `body text` · `pinned boolean` · `created_at`. Append-only (no update, no delete); a correction is a new note.

### `support_access_grants`

`id` · `workspace_id` · `granted_to uuid` (the platform staff member) · `granted_by uuid` (a workspace **owner**) · `scope enum(metadata|content)` · `reason text not null` · `requested_at`, `granted_at`, `expires_at not null`, `revoked_at`, `revoked_by`. At most one live grant per `(workspace_id, granted_to)`. Maximum duration 24 hours.

### `platform_broadcasts`

`id` · `audience enum(all_users|all_owners|workspace|plan)` · `audience_ref` · `title`, `body`, `action_url` · `is_critical boolean` · `sent_by`, `sent_at`, `recipient_count`. Emission goes through `app.notify` (F-ID-07 §4.6).

### Read models

The schools list reads a materialised view `platform_workspace_overview` refreshed every 5 minutes: `workspace_id, name, short_code, type, status, plan_name, subscription_status, trial_ends_at, member_counts_by_role, student_count, storage_bytes, ai_credits_used_30d, last_activity_at, created_at, owner_name, owner_email`. **It contains counts and identifiers only — never a student name, a mark, a message or a file name.** That boundary is the whole design.

### RLS, in words

- `feature_flags`, `feature_flag_overrides`, `platform_settings`, `platform_support_notes`, `platform_broadcasts`, `platform_workspace_overview`: **select/insert/update require `app.is_platform_admin()`**. `platform_support_notes` and `platform_broadcasts` have no update or delete grant. `platform_settings` is additionally readable through the public view by everyone (SLA and support contacts appear in seller-facing copy).
- A workspace's own members read **their** effective flags through `app.workspace_flags(workspace_id)` — a SECURITY DEFINER function returning `{key: boolean}` — not the override table.
- `support_access_grants` **select**: platform staff, plus `{owner,admin}` of the target workspace (an owner must be able to see who has access). **Insert/update to `granted_at`**: the target workspace's **owner only** — a platform admin can _request_ a grant (inserting a row with `granted_at is null`), and only an owner can approve it. **Revoke**: either side, any time.
- The content-scope grant works by `app.has_support_grant(workspace_id)` being OR-ed into the **select** policies of the specific tables the console needs, and **never** into insert, update or delete. It is explicitly **not** added to `notifications`, `diary_entries`, `personal_students`, `personal_attendance`, or any `files` row with `visibility='private'` (F-ID-06 §2) — those stay closed even under a grant.
- Every read performed under a grant writes an `audit_events` row `platform.support_read` with the table and row id.

Private files: none owned here. The console links to KYC documents, which are read through the marketplace area's own narrow policy and logged to `file_access_log`.

## 4. Workflows

### 4.1 Entering the console

**Trigger:** `/platform`, or the "Platform console" item that appears in the profile menu only when `is_platform_admin`.

Middleware checks `profiles.is_platform_admin` server-side on every `/platform/*` request (not once at login), then renders the `PlatformShell`: a distinct visual treatment — a slate header bar with the word **Platform** and the environment name — so a staff member can never confuse a console tab with a school tab. There is **no workspace switcher** in this shell and no `x-workspace-id` is sent; the console's queries are platform-scoped by definition.

**Phone:** the console is fully usable at 360×800 (support happens on phones) with a five-item bottom nav: **Schools · Queues · Flags · Plans · More** (More holds Broadcasts, Audit, Settings, Accounts).
**Audit:** `platform.console_opened` once per session.
**Failure case:** a non-staff user requesting `/platform/*` gets a 404 — not a 403, which would confirm the console exists.

### 4.2 Schools list

**Route:** `/platform/schools`.

Server-side search over name, short code, EIIN, slug and owner email; filters for plan, subscription status, workspace status, created-date range, and "trial ending in 7 days". Sort by created, last activity, member count or storage. Cursor pagination.

**Phone:** cards showing name, short code, plan chip, status chip, member count and last activity. **Desktop:** a dense table with the same columns plus student count and storage.

Row → the workspace inspector. Bulk actions: none in v1 (a bulk suspend is exactly the kind of thing that should be slow and deliberate).

### 4.3 Workspace inspector

**Route:** `/platform/schools/[id]`. Tabs:

1. **Overview** — identity (name, short code, EIIN, board, timezone, created, owner with a mailto), plan and subscription state with trial countdown, seat usage against plan limits, storage usage, AI credit usage over 30 days, and the four first-run checklist items as health indicators. Everything here is a count or an identifier.
2. **People** — the roster as _counts by role and status_, plus the owners listed by name and email so support knows who to call. Individual teachers are **not** listed by default; a name search resolves one person at a time and logs the lookup.
3. **Flags** — the effective flag set for this workspace with the source of each value (default / global override / workspace override) and an inline toggle that requires a reason.
4. **Activity** — the audit summary for this workspace (F-ID-09 embedded, read-only, last 200 events) with a link to the full viewer.
5. **Support** — append-only notes, the grant history, and the "Request access" button.
6. **Danger** — Suspend workspace (reason required), Reinstate, Release EIIN (archived workspaces only).

**Audit:** `platform.workspace_viewed` on open, `platform.person_looked_up` on a people search, plus a row per danger action.
**Failure case:** the inspector renders every panel independently, so a missing subscription row (a workspace created before billing shipped) shows "No subscription" rather than blanking the page.

### 4.4 Suspending and reinstating

Suspend requires a typed reason and a confirmation of the workspace name. On suspend: `workspaces.status='suspended'`, `suspended_at`, `suspended_reason`; every member's next request hits the suspended screen (F-ID-03 §4.3); the owners receive a high-priority notification and an email naming the reason and the support contact. Reinstating reverses it and notifies again. **Data is never touched** by either action.
**Audit:** `platform.workspace_suspended` / `platform.workspace_reinstated` with the reason.

Account-level suspension (`profiles.status='suspended'`) works the same way for one person: sign-in is blocked, existing sessions are revoked, and the reason is emailed. Used for confirmed abuse, not for support convenience.

### 4.5 Support access — the impersonation-free alternative

**Trigger:** the inspector's Support tab → "Request access".

1. Staff pick a scope (**metadata** or **content**), a duration (≤ 24 h) and type a reason. This inserts a `support_access_grants` row with `granted_at is null` and notifies every owner (`support.grant_requested`, high priority, in-app + email).
2. The owner sees the request in `/app/settings/workspace` → Support: who is asking, what scope, for how long, why — and **Approve** or **Decline**. Approving sets `granted_at` and starts the clock.
3. While the grant is live, the staff member's reads of the permitted tables succeed, each writing `platform.support_read`. The console shows a persistent amber bar: "Support access to Ideal School — expires in 3h 12m — End now".
4. The owner sees the same bar in their own settings and can revoke instantly. Expiry is automatic and enforced in `app.has_support_grant` at read time, not by a sweep.
5. On expiry or revocation, both sides are notified (`support.grant_expired`), and the full list of what was read is available to the owner in their audit viewer.

**Why this instead of impersonation:** the owner consents, the scope is narrow, the window is short, and every read is attributable to a named staff member rather than hidden inside a borrowed session. Nothing in this flow can produce a write.
**Failure cases:** no owner responds → the request expires after 24 h and is marked `expired`; a suspended workspace cannot grant access; content scope is refused outright for personal workspaces (F-ID-06 §2 OQ-6).

### 4.6 Feature flags

**Route:** `/platform/flags`.

A list of flags with their default, the global override (if any), the count of workspace overrides, the owning area and a description. Opening one shows the override table and an "Add override" sheet: workspace (searchable), enabled/disabled, **reason (required)**, optional expiry.

Flags are read in the app through `app.workspace_flags(workspace_id)`, cached per request, so a flag change takes effect on the next request without a deploy. Kill switches are visually distinct and their "on" direction is disabled in the UI — a kill switch exists to turn something off.

**Audit:** `platform.feature_flag_changed` with key, target, old value, new value and reason.
**Failure case:** an override on a flag whose `scope='global'` is rejected with a named error rather than silently ignored.

### 4.7 Plans editor entry

**Route:** `/platform/plans`. This feature owns the **entry point and the guardrails**; the plan matrix's fields and billing semantics belong to the billing area (PRODUCT-DECISIONS §5.1, DECISION-LOG D-18).

The guardrails this shell enforces: editing a plan requires a reason; changes to **limits** apply to workspaces immediately, while changes to **price** apply only to new subscriptions and renewals (existing subscriptions keep their snapshotted price); lowering a limit below any existing workspace's current usage shows exactly which workspaces would be affected before saving; every save writes `platform.plan_updated` with a full before/after diff.

### 4.8 Queue entry points

`/platform/queues` is a hub listing the queues owned by other areas with live counts and the oldest item's age against its SLA: **Listing review** (marketplace §4.4), **Seller KYC** (§4.5, 2-business-day SLA), **Teacher verification** (PRODUCT-DECISIONS §6.2), **Payouts** (§4.2, monthly on the 1st), **Refunds** (§4.8), **Credit requests** (§3.3). Each tile links into the owning area's screen. This shell renders the counts from those areas' repositories and **specifies nothing about their internals**.

### 4.9 Broadcasts

`/platform/broadcasts`. Compose: audience (all users / all owners / one workspace / one plan), title, body, optional action URL, a critical flag, and a **preview of the recipient count before sending**. Sending fans out through `app.notify` with the `platform.broadcast` event. A sent broadcast is immutable and listed with its recipient count.
**Audit:** `platform.broadcast_sent`.
**Failure case:** an audience resolving to more than 50,000 recipients requires a second confirmation and is chunked by the job runner.

### 4.10 Platform settings

`/platform/settings`. Commission basis points, payout minimum and hold days, KYC and listing SLAs, support contacts, and a maintenance banner that renders across every shell when enabled. Commission changes **never** retroactively alter snapshotted order lines (PRODUCT-DECISIONS §4.3) and the screen says so above the field.
**Audit:** `platform.settings_changed` with a before/after diff.

## 5. Business rules and calculations

| Rule                               | Value                                                                                                                          | Where                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Console access                     | `profiles.is_platform_admin = true`, checked server-side on every `/platform/*` request                                        | middleware + `app.is_platform_admin()`  |
| Non-staff response                 | **404**, never 403                                                                                                             | middleware                              |
| Granting platform admin            | migration or reviewed service-role script only; never through the app; every grant recorded in `audit_events` by the migration | —                                       |
| Default content access             | **none** — platform staff read the overview view, platform tables and `audit_events`, and nothing else                         | RLS                                     |
| Support grant                      | owner-approved, read-only, ≤ 24 h, reason required, one live grant per (workspace, staff member)                               | `support_access_grants`                 |
| Grant exclusions                   | `notifications`, `diary_entries`, `personal_students`, `personal_attendance`, private `files` are never readable under a grant | RLS policy composition                  |
| Grant enforcement                  | evaluated at read time in `app.has_support_grant`; expiry needs no sweep                                                       | SQL function                            |
| Every grant read                   | writes `platform.support_read` with table and row id                                                                           | policy-adjacent trigger                 |
| Impersonation                      | **not implemented, and its absence is a tested property** (no code path mints a session for another user)                      | Semgrep rule + test                     |
| Overview freshness                 | materialised view refreshed every 5 minutes by pg_cron; the inspector shows "as of HH:MM"                                      | pg_cron                                 |
| Overview contents                  | counts and identifiers only; a CI test asserts the view's column list against an allow-list                                    | migration test                          |
| Flag resolution                    | workspace override → global override → `default_enabled`; first match wins; cached per request                                 | `app.workspace_flags`                   |
| Flag reason                        | required on every override write                                                                                               | `not null` + Zod                        |
| Kill switches                      | may be turned off by an override; the UI disables turning one on                                                               | `feature_flags.is_kill_switch`          |
| Plan limit changes                 | effective immediately; the editor previews affected workspaces before saving                                                   | billing area + this shell's guardrail   |
| Plan price changes                 | apply to new subscriptions and renewals only                                                                                   | billing area                            |
| Commission                         | `platform_settings.commission_bps`, default 3000; snapshotted per order line, never retroactive                                | PRODUCT-DECISIONS §4.3                  |
| Broadcast confirmation             | a second confirmation above 50,000 recipients                                                                                  | `packages/domain/platform/broadcast.ts` |
| Suspension                         | never deletes or alters tenant data; reason required; owners notified                                                          | `workspaces.status`                     |
| Session revocation of another user | allowed for confirmed abuse, audited, and the user is emailed                                                                  | `platform.session.revoke`               |
| Support notes                      | append-only; corrections are new notes                                                                                         | no update/delete grant                  |
| Queue SLAs                         | KYC 2 business days, listing review per `platform_settings`; the hub shows oldest-item age against them                        | PRODUCT-DECISIONS §4.5                  |

## 6. UI

Components: `PlatformShell` (distinct slate chrome + environment chip), `BottomNav` (platform variant), `DataList`, `FilterSheet`, `StatCard`, `DefinitionList`, `TabBar`, `FormSheet`, `ConfirmSheet` (reason-required variant), `ReasonField`, `AuditTable` (from F-ID-09), `QueueTile`, `Banner` (support-grant bar), `DiffView`, `EmptyState`, `Skeleton`.

| Screen / route                       | 360×800                                                                                                                                      | ≥1024                                                                           | Primary action     | Empty                                             | Loading             | Error                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| Console home — `/platform`           | Stat tiles in a 2-up grid (workspaces, trials ending, queue backlog, incidents), then a queue summary list                                   | 4-up tiles + a two-column layout with recent platform audit events on the right | Open queues        | "No backlog" per tile                             | tile skeletons      | per-tile alert; one failure never blanks the page                |
| Schools — `/platform/schools`        | Sticky search; filter chips row; workspace cards (name, code, plan, status, members, last activity)                                          | Dense table, 12 columns, sortable headers, sticky filter bar                    | Search             | "No workspaces match" with a clear-filters button | 8 skeleton rows     | list-level alert with retry                                      |
| Inspector — `/platform/schools/[id]` | Header block (name, code, status chip, plan chip), then a horizontally scrollable `TabBar`; each tab is a stacked card list; Danger tab last | Left summary rail + right tab panel at 960 px                                   | contextual per tab | Per-panel empty copy ("No subscription record")   | per-panel skeletons | per-panel alert                                                  |
| People tab                           | Counts by role as a small table; a one-at-a-time name search below with a note that lookups are logged                                       | Same, wider                                                                     | Search a person    | "Counts only — search to resolve one person"      | skeleton            | inline                                                           |
| Support tab                          | Notes list (append-only) with a compose sheet; grant history; "Request access" primary button                                                | Two columns: notes left, grants right                                           | Request access     | "No support history"                              | skeletons           | inline                                                           |
| Support-grant bar                    | Sticky amber bar under the platform header: workspace, scope, countdown, **End now**                                                         | Same, full width                                                                | End now            | —                                                 | —                   | —                                                                |
| Flags — `/platform/flags`            | Flag cards with default and override counts; opening one shows overrides as a list; add via sheet with a required reason field               | Table of flags + an override table in a right panel                             | Add override       | "No flags yet"                                    | skeletons           | inline; scope errors named                                       |
| Plans — `/platform/plans`            | Plan cards stacked; editing opens a full-height sheet; the affected-workspaces preview appears above the save button                         | Matrix table with inline edit and a `DiffView` before save                      | Save plan          | n/a                                               | skeleton            | inline; the preview blocks a destructive save until acknowledged |
| Queues — `/platform/queues`          | `QueueTile` list: name, count, oldest age, SLA state (green/amber/red)                                                                       | 3-up tile grid                                                                  | Open a queue       | "All clear"                                       | tile skeletons      | per-tile alert                                                   |
| Broadcasts — `/platform/broadcasts`  | Compose sheet with audience picker and a live recipient count; sent list below                                                               | Two columns: compose left, history right                                        | Send               | "Nothing sent yet"                                | skeleton            | inline; the count must resolve before Send enables               |
| Settings — `/platform/settings`      | Sections with a reason field at the bottom of each; the commission field carries its non-retroactive note inline                             | Left nav + right form                                                           | Save               | n/a                                               | skeleton            | inline                                                           |
| Non-staff access                     | —                                                                                                                                            | —                                                                               | —                  | —                                                 | —                   | **404 page**, identical to any other unknown route               |

Accessibility: the console meets the same bar as the rest of the app (44 px targets, axe-clean, keyboard-complete); the support-grant bar is `role="status"` and announces the countdown at 10 and 1 minutes remaining; reason fields are required with visible, associated error text; destructive confirmations name the workspace in the accessible label.

## 7. Server contracts

Schemas in `packages/contracts/src/platform/*.ts`. Actions in `apps/web/app/(platform)/platform/**/actions.ts`. Every action asserts `app.is_platform_admin()` **and** `can('platform.*')` before touching a repository.

| Action / handler                                                             | Input schema                                                                                                                                                   | Output                                                                      | Errors                                                                                              | Idempotency                             | Rate limit                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------- |
| `listPlatformWorkspaces`                                                     | `ListPlatformWorkspacesInput` {q?, plan_id?, status?, subscription_status?, created_from?, created_to?, trial_ending_within_days?, sort?, cursor?, limit ≤ 50} | `Paginated<WorkspaceOverviewDto>`                                           | `FORBIDDEN`                                                                                         | n/a                                     | 120/min                     |
| `getWorkspaceInspector`                                                      | `WorkspaceInspectorInput` {workspace_id}                                                                                                                       | `{ overview, plan, subscription, seats, storage, flags, checklist, as_of }` | `FORBIDDEN`, `NOT_FOUND`                                                                            | n/a                                     | 120/min                     |
| `lookupPersonInWorkspace`                                                    | `PersonLookupInput` {workspace_id, q}                                                                                                                          | `{ matches: {user_id, full_name, email, role, status}[] ≤ 5 }`              | `FORBIDDEN`                                                                                         | n/a                                     | 60/min — every call audited |
| `suspendWorkspace` / `reinstateWorkspace`                                    | `SuspendWorkspaceInput` {workspace_id, reason ≥ 10 chars, confirm_name}                                                                                        | `WorkspaceOverviewDto`                                                      | `FORBIDDEN`, `NAME_MISMATCH`, `ALREADY_IN_STATE`                                                    | idempotent                              | 20/day                      |
| `releaseEiin`                                                                | `ReleaseEiinInput` {workspace_id, reason}                                                                                                                      | `{ ok: true }`                                                              | `FORBIDDEN`, `NOT_ARCHIVED`                                                                         | idempotent                              | 10/day                      |
| `suspendAccount` / `reinstateAccount`                                        | `SuspendAccountInput` {user_id, reason ≥ 10 chars}                                                                                                             | `{ ok: true }`                                                              | `FORBIDDEN`                                                                                         | idempotent                              | 20/day                      |
| `revokeUserSessions`                                                         | `RevokeUserSessionsInput` {user_id, reason}                                                                                                                    | `{ revoked: n }`                                                            | `FORBIDDEN`                                                                                         | idempotent                              | 20/day                      |
| `requestSupportAccess`                                                       | `RequestSupportAccessInput` {workspace_id, scope, duration_minutes ≤ 1440, reason ≥ 10 chars}                                                                  | `SupportGrantDto`                                                           | `FORBIDDEN`, `GRANT_ALREADY_LIVE`, `WORKSPACE_SUSPENDED`, `SCOPE_NOT_ALLOWED` (personal workspaces) | one live request per (workspace, staff) | 20/day                      |
| `respondToSupportRequest` (owner-side, lives in the school settings actions) | `RespondSupportRequestInput` {grant_id, action: 'approve'\|'decline'}                                                                                          | `SupportGrantDto`                                                           | `FORBIDDEN`, `NOT_PENDING`                                                                          | idempotent                              | 30/h                        |
| `endSupportAccess`                                                           | `EndSupportAccessInput` {grant_id}                                                                                                                             | `SupportGrantDto`                                                           | `NOT_FOUND`                                                                                         | idempotent                              | 60/h                        |
| `listSupportNotes` / `addSupportNote`                                        | `AddSupportNoteInput` {workspace_id, body 1–4000, pinned?}                                                                                                     | `SupportNoteDto`                                                            | `FORBIDDEN`                                                                                         | n/a                                     | 120/h                       |
| `listFeatureFlags`                                                           | `ListFlagsInput` {q?}                                                                                                                                          | `FeatureFlagDto[]`                                                          | `FORBIDDEN`                                                                                         | n/a                                     | 120/min                     |
| `upsertFeatureFlag`                                                          | `UpsertFeatureFlagInput` {key, description, scope, default_enabled, is_kill_switch, owner_area, reason}                                                        | `FeatureFlagDto`                                                            | `FORBIDDEN`, `VALIDATION`                                                                           | by key                                  | 60/h                        |
| `setFeatureFlagOverride`                                                     | `SetFlagOverrideInput` {flag_key, workspace_id?: uuid \| null, enabled, reason ≥ 10 chars, expires_at?}                                                        | `FeatureFlagOverrideDto`                                                    | `FORBIDDEN`, `FLAG_NOT_FOUND`, `SCOPE_MISMATCH`, `KILL_SWITCH_CANNOT_ENABLE`                        | by (flag, target)                       | 120/h                       |
| `removeFeatureFlagOverride`                                                  | `RemoveFlagOverrideInput` {override_id, reason}                                                                                                                | `{ ok: true }`                                                              | `NOT_FOUND`                                                                                         | idempotent                              | 120/h                       |
| `listPlans` / `updatePlan`                                                   | `UpdatePlanInput` (billing area's schema) + `{reason, acknowledge_affected: boolean}`                                                                          | `PlanDto` + `{ affected_workspaces }`                                       | `FORBIDDEN`, `AFFECTED_NOT_ACKNOWLEDGED`, `VALIDATION`                                              | by (plan_id, payload hash)              | 30/h                        |
| `getQueueCounts`                                                             | `QueueCountsInput` {}                                                                                                                                          | `{ queues: {key, count, oldest_age_minutes, sla_state}[] }`                 | `FORBIDDEN`                                                                                         | n/a                                     | 60/min                      |
| `previewBroadcastAudience`                                                   | `BroadcastAudienceInput` {audience, audience_ref?}                                                                                                             | `{ recipient_count }`                                                       | `FORBIDDEN`                                                                                         | n/a                                     | 60/h                        |
| `sendBroadcast`                                                              | `SendBroadcastInput` {audience, audience_ref?, title ≤ 120, body ≤ 1000, action_url?, is_critical, confirmed_count}                                            | `{ broadcast_id, recipient_count }`                                         | `FORBIDDEN`, `COUNT_MISMATCH`, `CONFIRMATION_REQUIRED`                                              | `idempotency_key` required              | 10/day                      |
| `getPlatformSettings` / `updatePlatformSettings`                             | `UpdatePlatformSettingsInput` (partial) + `{reason}`                                                                                                           | `PlatformSettingsDto`                                                       | `FORBIDDEN`, `VALIDATION`                                                                           | last write wins                         | 30/h                        |
| `GET /api/jobs/platform/refresh-overview` (cron)                             | —                                                                                                                                                              | `{ refreshed_at }`                                                          | —                                                                                                   | idempotent                              | every 5 min                 |

There is **no** action anywhere in the codebase that creates a session for another user; a CI test asserts that the Supabase admin `generateLink`, `createUser` and `signInWithPassword`-as-another-user surfaces are not imported outside the auth adapter's own registration path.

## 8. Parts (build chunks)

**Part 1 — `/platform` boundary and shell** · The `(platform)` route group, middleware enforcing `is_platform_admin` on every request with a 404 for everyone else, `PlatformShell` with distinct chrome, the environment chip, the phone bottom nav, `platform.console_opened` audit, the profile-menu entry. · Files: `apps/web/middleware.ts`, `apps/web/app/(platform)/layout.tsx`. · Tests: a route-guard integration test for staff/non-staff/anonymous returning 200/404/404; pgTAP that `is_platform_admin` cannot be self-granted; a test that no `x-workspace-id` is sent from the console. · **Demo:** a normal owner gets a 404 on `/platform`; a staff account sees the console on a phone with a working bottom nav.

**Part 2 — Overview view and the schools list** · The `platform_workspace_overview` materialised view + 5-minute refresh, the allow-list CI test on its columns, `listPlatformWorkspaces` with server-side search/filter/sort/pagination, the phone card list and desktop table. · Tests: the column allow-list test (fails if anyone adds a student name); search and filter integration tests; performance test at 5,000 workspaces. · **Demo:** find a school by EIIN in one search on a phone, and show the view contains no tenant content.

**Part 3 — Workspace inspector** · All six tabs, `getWorkspaceInspector`, `lookupPersonInWorkspace` with its audit row, the audit-summary embed, resilient per-panel rendering, `platform.workspace_viewed`. · Tests: a panel-failure test (a missing subscription renders a state, not an error page); an audit test that opening the inspector and searching a person each write exactly one row. · **Demo:** open a school, read its seat usage against the plan, and show both audit rows.

**Part 4 — Support grants (the impersonation-free path)** · `support_access_grants` + RLS, `app.has_support_grant` composed into the permitted tables' select policies only, the exclusion list, `platform.support_read` logging, the request/approve/revoke flows on both sides, the countdown bar, the four notifications. · Tests: pgTAP — a grant never enables insert/update/delete; excluded tables stay closed under a live grant; an expired grant fails at read time with no sweep; every granted read produces an audit row. E2E across two accounts for request → approve → read → revoke. · **Demo:** staff request access, an owner approves on a phone, staff read one screen, the owner revokes, and the owner's audit viewer lists exactly what was read.

**Part 5 — Feature flags** · `feature_flags` + overrides + RLS, `app.workspace_flags` with per-request caching, the flags screens, required reasons, kill-switch semantics, scope validation, `platform.feature_flag_changed` audit. · Tests: resolution-order unit tests; kill-switch enable rejection; a test that a flag change affects the next request without a deploy; audit diff assertions. · **Demo:** disable `invites.sms` for one school, show invitations hide the SMS tab for that school only, and show the reason in the audit trail.

**Part 6 — Plans entry, queues hub, broadcasts, platform settings** · `/platform/plans` with the affected-workspaces preview and diff-before-save guardrails (billing owns the fields), `/platform/queues` counts and SLA states, broadcasts with audience preview and `app.notify` fan-out, `/platform/settings` with reasons and the non-retroactive commission note, the maintenance banner. · Tests: affected-workspace preview correctness; broadcast count-mismatch rejection; fan-out job test at 10,000 recipients; settings diff audit. · **Demo:** send a broadcast to all owners from a phone, see the preview count match the delivered count, and read the audit row.

## 9. Acceptance criteria

1. **Given** a signed-in user without `is_platform_admin`, **when** they request any `/platform/*` route, **then** they receive a 404 — identical to an unknown route — and no console markup is served.
2. **Given** a platform admin, **when** the console renders, **then** no `x-workspace-id` header is sent by any console request and no workspace switcher appears.
3. **Given** any user including a platform admin, **when** they attempt to set `profiles.is_platform_admin` on themselves or anyone else through the app, **then** the update is rejected.
4. **Given** the `platform_workspace_overview` view, **when** the CI allow-list test inspects its columns, **then** it contains only counts, identifiers, plan and status fields — a column exposing a student name, mark, message or file name fails the build.
5. **Given** a platform admin with no support grant, **when** they query `students`, `marks`, `messages`, `notifications`, `diary_entries`, `personal_students` or a private `files` row, **then** zero rows are returned.
6. **Given** a platform admin who requests support access, **when** no owner has approved, **then** the grant is not live and reads still return zero rows.
7. **Given** an owner who approves a content-scope grant for 2 hours, **when** the staff member reads a permitted table, **then** the read succeeds, an `audit_events` row `platform.support_read` records the table and row id, and the owner can see it in their audit viewer.
8. **Given** a live support grant, **when** the staff member attempts any insert, update or delete on a granted table, **then** it is rejected — grants are read-only by construction.
9. **Given** a live support grant, **when** the staff member reads `notifications`, `diary_entries`, `personal_students`, `personal_attendance` or a private personal file, **then** zero rows are returned — the exclusion list holds even under a grant.
10. **Given** a grant whose `expires_at` has passed, **when** a read is attempted before any sweep job runs, **then** it returns zero rows.
11. **Given** an owner who revokes a live grant, **when** the staff member's next read runs, **then** it returns zero rows and both parties have been notified.
12. **Given** the codebase, **when** the CI impersonation test runs, **then** no code path outside the auth adapter's registration flow can mint a session for another user.
13. **Given** a platform admin suspending a workspace with a typed reason and name confirmation, **when** it completes, **then** every member sees the suspended screen on their next request, the owners are notified with the reason, and no tenant row was modified.
14. **Given** a feature flag override created without a reason, **when** it is submitted, **then** it is rejected by validation.
15. **Given** a workspace-scoped override on a flag whose scope is `global`, **when** it is submitted, **then** `SCOPE_MISMATCH` is returned.
16. **Given** a flag override set for one workspace, **when** members of that workspace and another workspace load the app, **then** only the targeted workspace's behaviour changes, on the next request, with no deploy.
17. **Given** a plan limit lowered below existing usage, **when** the editor previews, **then** it names the affected workspaces and the save is blocked until acknowledged; **and** saving never alters snapshotted prices on existing subscriptions.
18. **Given** a broadcast whose previewed recipient count differs from the count at send time, **when** Send is pressed, **then** `COUNT_MISMATCH` is returned and the staff member must re-preview.
19. **Given** a person lookup inside the inspector, **when** it runs, **then** at most five matches are returned and exactly one `platform.person_looked_up` audit row is written.
20. **Given** the console at 360×800, **when** a support engineer works through the schools list and inspector, **then** every action is reachable with one thumb and axe reports no serious or critical issues.

## 10. Tests

- **Unit:** flag resolution order; SLA state calculation (green/amber/red against `platform_settings`); broadcast audience sizing; affected-workspace computation for a plan limit change; grant duration and expiry arithmetic; reason-length validators.
- **DB (pgTAP):** every platform table denies `authenticated` non-staff select/insert/update/delete; `platform_support_notes` and `platform_broadcasts` have no update or delete grant; `support_access_grants` can be approved only by an owner of the target workspace; `app.has_support_grant` returns false for expired, revoked and unapproved rows; the grant is OR-ed only into select policies (an insert attempt under a grant fails on every permitted table); the exclusion list is enforced; `is_platform_admin` is not self-writable.
- **Integration:** every action in §7 for happy path and each named error; the 404-for-non-staff guard on every `/platform/*` route including nested ones; `sendBroadcast` idempotency replay; the materialised-view refresh job.
- **E2E (360×800 and 1280×800):** `platform-404-for-owner`, `find-school-and-inspect`, `support-grant-request-approve-read-revoke` (two accounts), `flag-override-affects-one-workspace` (two workspaces), `suspend-and-reinstate-workspace`, `broadcast-preview-and-send`.
- **A11y:** axe on every console route; the support-grant countdown announces at thresholds; reason fields have associated errors; the schools table has proper header semantics at desktop and card semantics at phone.
- **Performance budgets:** `listPlatformWorkspaces` p95 ≤ 300 ms at 5,000 workspaces; the inspector loads in ≤ 6 parallel queries; the overview refresh completes in ≤ 10 s; `app.workspace_flags` ≤ 5 ms and is cached per request.
- **Security:** the impersonation absence test; a Semgrep rule that no `/platform` action imports a tenant repository without a grant check; a test that the console never renders a value sourced from a tenant content table without a live grant; secret-free logging assertions.

## 11. Open questions

- **OQ-1 (conflict with ARCHITECTURE §3): the breadth of the platform-admin bypass.** ARCHITECTURE §3 says "Platform admin has a bypass policy on the tables the console needs (read)". This spec narrows that to: the overview view, platform tables and `audit_events` by default, with tenant content reachable **only** under an owner-granted, time-boxed, logged grant, and never for personal-workspace content or any user's notifications. **Default assumed:** the narrow reading. If the owner wants staff to be able to read student records without owner consent (for example, to satisfy a legal request), that must be an explicit, separately audited capability rather than an ambient bypass — and ARCHITECTURE §3 should be amended either way.
- **OQ-2: who grants `is_platform_admin`, and to whom.** **Default assumed:** migration-only, with the first account seeded by the owner; a future `/platform/staff` screen with two-person approval is deferred.
- **OQ-3: legal/compliance access.** No decision exists for a court order or a child-safeguarding emergency where an owner cannot or will not consent. **Default assumed:** a `break_glass` scope on `support_access_grants` that requires two platform admins to co-sign, notifies the owner immediately and is capped at 4 hours — specified but **not built** in v1 until the owner decides.
- **OQ-4: environment separation.** **Default assumed:** the same console code runs in preview and production with a prominent environment chip; staff accounts are separate per environment and no production data is readable from a preview deployment.
- **OQ-5: queue ownership.** The queues hub renders counts from the marketplace and billing areas. **Default assumed:** each owning area exposes a `getQueueSummary()` repository function with a fixed shape; if an area has not shipped, its tile renders "Not available yet" rather than zero (a false all-clear is worse than a gap).
- **OQ-6: `audit_events` retention vs. the overview.** The console's Activity tab reads `audit_events`, which is retained indefinitely (ARCHITECTURE §10). **Default assumed:** the tab shows the last 200 events with a link to F-ID-09 for the full, filterable history.
