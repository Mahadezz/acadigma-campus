# F-OP-04 — Print Queue

|                  |                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | ops                                                                                                                                                    |
| Status           | planned                                                                                                                                                |
| Owner branch     | `feat/ops-print-queue`                                                                                                                                 |
| Depends on       | F-OP-03 (report runs produce the PDFs), F-AC-0x (enrollments for copy counts), F-TI-0x (resources/handouts), F-OP-05 (notifications), files/storage    |
| Plan             | `docs/plan/ROADMAP.md` chunk TBD                                                                                                                       |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §1.3, §2.2 (`PrintQueue`, `Printer`), §3 rows 40–53, §4.4, §5 (Print), §6.1, §7.12, §7.13, §8 Q8–Q9 |

---

## 1. Purpose

Printing in a Bangladeshi school is a shared, contested resource: one or two machines, a queue of teachers, and a daily argument about how many copies Class 6 – A actually needs. **Print Queue** is the shared list: anyone with the right can add a job (a report the app generated, a handout from the library, or a file they uploaded), the copy count fills itself in from the section roster, and whoever is standing at the printer works down the list and marks each job done. In v1 the act of printing is a human with a browser; the queue's honesty about that is the feature.

**What Base44 intended and what was fake.** The design was the most coherent in the area (§1.3) — `Printer` rows, `PrintQueue` jobs, and a documented Python agent that would poll, claim, download and spool to CUPS. The auto-copies-from-roster rule genuinely worked (§3 row 45). Everything downstream was theatre: the **"Print" button only flipped `status` to `printing` and sent nothing anywhere** (§7.12); printer `status` and `paper_level` were **typed in by humans** and rendered as a pulsing green dot and a paper bar with arbitrary constants (§3 rows 42, §5); **no agent existed in the repo** (§3 row 52); four of the five "templates" were labels with no generator, so users pasted a document URL by hand (§6.1); there was no `created_by`, so nobody could tell who queued a job (§2.2); a teacher could delete any printer with no confirmation (§3 row 43); and two `<SelectItem value={null}>` options crashed Radix on open (§7.9).

**Done looks like:** a teacher taps _Print_ on a finished report run, the queue shows "Report cards · Class 6 – A · 34 copies × 3 pages = 102 sheets · queued by Ms. Nadia", the office staff member at the printer opens it on the shared PC, hits Download, prints from the PDF viewer, taps **Mark printed**, and the teacher gets a notification. No fake status. No green dots. When the Windows app ships, the same rows are claimed by an agent instead of a person, and nothing about the schema changes.

## 2. Roles and permissions

| Action                                 | Permission key   |                owner                 | admin | teacher | staff | parent | platform |
| -------------------------------------- | ---------------- | :----------------------------------: | :---: | :-----: | :---: | :----: | :------: |
| View the queue                         | `print.view`     |                  ✅                  |  ✅   |   ✅    |  ✅   |   —    |    —     |
| Create a print job                     | `print.submit`   |                  ✅                  |  ✅   |   ✅    |  ✅   |   —    |    —     |
| Edit **own** queued job                | `print.submit`   |                 own                  |  own  |   own   |  own  |   —    |    —     |
| Cancel **own** queued job              | `print.submit`   |                 own                  |  own  |   own   |  own  |   —    |    —     |
| Cancel / edit **any** job              | `print.manage`   |                  ✅                  |  ✅   |    —    |   —   |   —    |    —     |
| Mark a job printed / failed            | `print.manage`   |                  ✅                  |  ✅   |    —    |  ✅¹  |   —    |    —     |
| Reorder the queue (priority)           | `print.manage`   |                  ✅                  |  ✅   |    —    |   —   |   —    |    —     |
| Open the job's file                    | —                | job creator + `print.manage` holders |       |         |       |   —    |    —     |
| Manage printers (when the agent ships) | `printer.manage` |                  ✅                  |  ✅   |    —    |   —   |   —    |    —     |
| Register an agent / rotate its token   | `printer.manage` |                  ✅                  |  ✅   |    —    |   —   |   —    |    —     |

¹ `staff` is the role the office/printer operator holds. This is the fix for §7.11, where `permissions.js` said printer management was admin-only but the route let any teacher delete a printer.

**Plan entitlement:** `print_queue` is a **Starter** entitlement (PRODUCT-DECISIONS §5.1).

## 3. Data

> **Proposed; `docs/architecture/DATA-MODEL.md` wins.**

### 3.1 `print_jobs`

| Column                              | Type                                            | Notes                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace_id`                      | uuid                                            | tenant key                                                                                                                                     |
| `code`                              | text                                            | `PJ-2026-0431` via `app.next_id(workspace_id,'print_job')`                                                                                     |
| `title`                             | text not null                                   | auto-composed, editable                                                                                                                        |
| `kind`                              | enum `print_kind`                               | `report_card \| attendance_register \| mark_sheet \| staff_summary \| student_profile \| id_card \| handout \| exam_paper \| notice \| custom` |
| `source`                            | enum `print_source`                             | `report_run \| resource \| upload` — **every job has a real file**; there is no "paste a URL" path                                             |
| `report_run_id`                     | uuid null → `report_runs`                       | when `source='report_run'`                                                                                                                     |
| `resource_id`                       | uuid null → `resources`                         | when `source='resource'`                                                                                                                       |
| `file_id`                           | uuid not null → `files`                         | the PDF actually printed                                                                                                                       |
| `section_id`                        | uuid null                                       | the roster the copies came from                                                                                                                |
| `grade_level_id`                    | uuid null                                       | for whole-grade jobs                                                                                                                           |
| `copies`                            | int not null default 1, check 1–500             |                                                                                                                                                |
| `copies_source`                     | enum                                            | `roster \| manual` + `copies_source_note` text ("34 active students in Class 6 – A")                                                           |
| `pages_per_copy`                    | int                                             | read from the PDF at creation (`page_count`), editable only for uploads whose page count cannot be read                                        |
| `total_sheets`                      | int generated                                   | `copies × pages_per_copy` **stored**, not recomputed at render (§5, Base44 recomputed it in the list)                                          |
| `duplex`                            | bool default false                              |                                                                                                                                                |
| `colour`                            | enum `mono \| colour` default `mono`            |                                                                                                                                                |
| `paper_size`                        | enum `a4 \| a3 \| letter \| legal` default `a4` |                                                                                                                                                |
| `priority`                          | enum `normal \| urgent` default `normal`        |                                                                                                                                                |
| `needed_by`                         | timestamptz null                                | "before period 4" — drives sorting, not automation                                                                                             |
| `notes`                             | text                                            |                                                                                                                                                |
| `status`                            | enum `print_status`                             | `queued \| claimed \| printing \| printed \| failed \| cancelled`                                                                              |
| `printer_id`                        | uuid null → `printers`                          | **only set by an agent** in v1                                                                                                                 |
| `claimed_by_agent_id`, `claimed_at` |                                                 | agent-only                                                                                                                                     |
| `started_at`, `completed_at`        |                                                 |                                                                                                                                                |
| `failure_reason`                    | text                                            | required when `failed`                                                                                                                         |
| `requested_by`                      | uuid not null                                   | **who queued it** — the column Base44 omitted                                                                                                  |
| `completed_by`                      | uuid null                                       | null ⇒ completed by an agent                                                                                                                   |
| `idempotency_key`                   | text                                            |                                                                                                                                                |

Indexes `(workspace_id, status, priority desc, needed_by nulls last, created_at)`, `(workspace_id, requested_by)`, `(printer_id, status)`.
RLS: select for `has_role(workspace_id,'{owner,admin,teacher,staff}')`; insert for the same set with `requested_by = app.current_user_id()`; update limited by a policy that allows the creator to change `title/copies/notes/needed_by/cancelled` **while `status='queued'`**, and `has_role('{owner,admin,staff}')` to set `printed|failed|cancelled`; delete only `{owner,admin}` and only for `cancelled|printed` rows older than 24 h.
A trigger rejects any transition not in the state machine (§5.2) and any write to `printer_id`/`claimed_*` from a non-service-role connection.

### 3.2 `printers` — created in v1, **not surfaced as live status**

`(workspace_id, name, location, model, paper_size_default, duplex_capable, colour_capable, agent_id uuid null, is_active bool default true, notes)`.
Deliberately **absent**: `status`, `paper_level`, `last_checked`. Those columns do not exist until something real writes them; a column that only a human can type is a lie with a schema (§3 row 42). When the Windows agent ships, live state arrives in a **separate** table `printer_agent_state(printer_id, agent_id, state, paper_level, error_text, reported_at)` written **only** by the agent's service-role endpoint, and the UI shows it with a "last reported 2 min ago" timestamp — never a bare green dot.

In v1 the printers screen exists but is read-only and empty, with one honest sentence: _"Printer connections need the Acadigma Windows app. Until then, download and print from your browser."_ Adding a printer is possible (name/location/model, for labelling jobs), but no status is claimed.

### 3.3 `print_agents` — schema reserved, not shipped

`(workspace_id, name, token_hash, last_seen_at, version, revoked_at, created_by)`. The protocol is specified in §5.6 so the Tauri phase does not renegotiate it and so the v1 state machine already has the right states. **No agent endpoints are deployed in v1** — the routes exist behind a feature flag that is off, and CI asserts they return 404 when the flag is off.

### 3.4 Tables read

`report_runs`, `report_run_items`, `resources`, `files`, `enrollments`, `sections`, `grade_levels`, `workspace_members`, `notifications`, `audit_events`.

## 4. Workflows

### W1 — Queue a generated report (the main path)

Trigger: **Send to print queue** on a finished `report_runs` card (F-OP-03 W1/W2).

1. A sheet opens pre-filled: title from the run ("Report cards · Class 6 – A · Half-yearly"), `kind` mapped from `report_kind`, `file_id` from the run, `pages_per_copy` from `report_runs.page_count`, and **copies computed from the roster** (§5.1) with the count's provenance shown as a sentence the user can override.
2. Optional: duplex, colour, paper size, priority, needed-by, notes.
3. Submit → `print_jobs` row `queued`. Notification `print.queued` to members with `print.manage` (so the office knows work arrived) — batched to at most one notification per 10 minutes per workspace.
4. Outcome: the job appears at the top of _Queued_, sorted by priority then needed-by.
   Failures: the run expired (F-OP-03 §3.1) → the sheet offers "Regenerate first"; the file is missing → the job cannot be created (there is no job without a file).

### W2 — Queue a handout or an upload

Trigger: **New print job** on `/app/print`.

1. Source picker: _From reports_ (list of recent ready runs) · _From library_ (resource picker, PDF only) · _Upload a file_.
2. Upload accepts PDF, DOC/DOCX and images; **non-PDF uploads are converted server-side to PDF** at creation so the queue is homogeneous and `pages_per_copy` is always knowable. Conversion failure → the job is refused with a clear message, not queued with an unprintable file.
3. Then the same parameters as W1. If a section is chosen, copies auto-fill; a "No specific class" option is a **real menu item with a real value** (`__none__`), not `value={null}` (§7.9).
   Failures: file > 50 MB → refused with the limit named; workspace storage quota exceeded → refused with the upgrade path (PRODUCT-DECISIONS §3.11).

### W3 — Work the queue (v1, human)

Trigger: office staff opens `/app/print` on the shared PC or a phone.

1. Three segments: **Queued** (sorted), **Done today**, **All**. Each card: title, kind icon, copies × pages = sheets, who asked, when needed, notes.
2. Primary action on a queued card: **Open PDF** (signed URL, 5 min, logged). The browser's own print dialog does the printing — this is stated on the card ("Opens the PDF — print from your browser").
3. After printing: **Mark printed** → `status='printed'`, `completed_at`, `completed_by`. Or **Mark failed** with a required reason (jam, out of paper, wrong file) → `status='failed'`, which returns the job to the top of Queued as a retry candidate with the reason visible.
4. Notification `print.printed` / `print.failed` to `requested_by`.
5. **Cancel** is available to the creator while queued and to admins always; cancelling asks for confirmation naming the sheet count.
   **There is no button that claims to print and does not.** The v1 UI has _Open PDF_ and _Mark printed_; `printing` is a state only an agent can enter.

### W4 — Phone flow (explicit)

At 360×800 `/app/print` is: a segmented control (Queued · Done · All) under the title; a single column of cards; a FAB **+** bottom-right for a new job. A card's whole surface is tappable → **job sheet** with the metadata and a stacked action list: _Open PDF_ (primary, full width, 44 px), _Mark printed_, _Mark failed_, _Edit copies_, _Cancel_. Long-press a card enters multi-select for bulk _Mark printed_ / _Cancel_ with a sticky bottom bar. The sheet-count total for the current filter is pinned under the segmented control ("18 jobs · 412 sheets") because that is the number the office cares about. No horizontal scroll, no drag-to-reorder on touch — priority is a two-value toggle in the sheet.

### W5 — Reorder / prioritise

Admins can flip a job to `urgent` (sheet toggle, or drag on desktop). Sorting is `priority desc, needed_by nulls last, created_at asc`. There is no free-form ordinal column: an arbitrary drag order that nobody can explain is how queues become political.

### W6 — Agent path (reserved, Windows app phase)

Documented here so v1 does not paint it into a corner:

1. Agent authenticates with a per-agent token (`print_agents.token_hash`, bearer, rotatable) against `/api/print/agent/*` (flag-gated).
2. `POST /claim` with `{printer_id, capabilities}` → atomically selects the highest-priority `queued` job whose `paper_size`/`colour` fit, sets `status='claimed'`, `claimed_by_agent_id`, `claimed_at` (single `update … where status='queued' … returning` — no read-then-write race).
3. `GET /jobs/{id}/file` → a short-lived signed URL.
4. `POST /jobs/{id}/started` → `printing`; `POST /jobs/{id}/completed` → `printed`; `POST /jobs/{id}/failed` with a reason → `failed`.
5. Heartbeat `POST /agent/heartbeat` every 60 s writes `printer_agent_state`; a printer with no heartbeat for 5 minutes shows **"Not reporting"** — an absence, not a colour.
6. A `claimed`/`printing` job with no update for 15 minutes is returned to `queued` by a cron sweeper with a note ("agent stopped responding").

## 5. Business rules and calculations

### 5.1 Copies from the roster

```
copies = count(enrollments
               where section_id = :section
                 and status = 'active'
                 and academic_year_id = current_academic_year(workspace))
```

For a whole grade: the sum over its sections. Fallbacks, in order: the section's `expected_strength` if set → `1`. `copies_source='roster'` and `copies_source_note` records the sentence shown to the user ("34 active students in Class 6 – A, counted 12 Sep 14:20"). Any manual edit flips `copies_source='manual'` and keeps the original note for comparison.
**Copies are a snapshot.** A student admitted tomorrow does not change a job queued today; the note tells the operator when it was counted. (Base44's roster count worked and is kept verbatim in behaviour — §3 row 45 — just persisted properly.)
For `kind='id_card'` with a 10-up sheet, `copies` is the number of **sheets**, computed as `ceil(students / 10)`, and the note says so.

### 5.2 Status machine

```
queued ──(agent claim)──▶ claimed ──▶ printing ──▶ printed
  │                          │            │
  │                          └────────────┴──▶ failed ──(retry)──▶ queued
  ├──(human: Mark printed)──────────────────▶ printed
  ├──(human: Mark failed)───────────────────▶ failed
  └──(creator or admin)─────────────────────▶ cancelled
```

Rules:

- `claimed` and `printing` are **service-role-only** transitions. In v1, with the agent flag off, no code path can produce them; a pgTAP test asserts a normal user cannot set them.
- `printed` requires `completed_at`; `completed_by` is null **iff** an agent did it.
- `failed` requires `failure_reason`.
- Retry from `failed` creates **no new row**: it resets to `queued`, clears `claimed_*`/`started_at`, increments `attempt_count`, and appends to `failure_history jsonb[]`.
- `cancelled` and `printed` are terminal; editing them is refused.
- Every transition writes `audit_events` with actor and reason.

### 5.3 Sheets and totals

```
total_sheets(job)      = copies × pages_per_copy          // stored on the row
sheets_if_duplex(job)  = copies × ceil(pages_per_copy / 2) // displayed as a hint when duplex is on
queue_total(filter)    = Σ total_sheets over the filtered set
```

`pages_per_copy` comes from the PDF itself (`report_runs.page_count`, or pdf-lib's page count at upload). It is editable only when the count could not be read, and then it is marked _estimated_.

### 5.4 Sorting and visibility

Queued order: `priority desc (urgent first), needed_by asc nulls last, created_at asc`. "Done today" uses the workspace timezone day boundary. A teacher sees every job in the workspace (printing is a shared resource and hiding it causes duplicates) but may act only on their own.

### 5.5 Retention

`printed`/`cancelled` jobs are kept for **90 days**, then the row is deleted and the file's print-queue reference is dropped (the underlying `files` row follows its own retention — a report run's file expires at 30 days per F-OP-03, so an old print job may show "file expired" and offer Regenerate). Uploaded print files are deleted with the job.

### 5.6 Agent protocol contract (reserved)

Endpoints (all flag-gated, service-role, per-agent bearer token, all idempotent on `job_id + transition`):
`POST /api/print/agent/claim` · `GET /api/print/agent/jobs/{id}/file` · `POST /api/print/agent/jobs/{id}/started|completed|failed` · `POST /api/print/agent/heartbeat`.
Guarantees the schema must keep for that phase: a single-statement atomic claim; a per-job attempt counter; a stale-claim sweeper; capability matching on `paper_size`/`colour`/`duplex`; and `printer_agent_state` separate from `printers` so configuration and telemetry never mix.

### 5.7 Explicitly **not** in v1 (stated in the UI, not hidden)

- No live printer status, paper level, toner, or queue depth on the device.
- No button that sends bytes to a printer.
- No scheduled printing (`scheduled_at` is not a column; Base44 had the field with no UI and no executor — §4.4). Use `needed_by`, which is advisory and honest.
- No printer sharing across workspaces.

## 6. UI

| Screen    | Route                   | 360×800                                                                             | ≥1024                                                            | Primary action           | Empty / loading / error                                                                                           |
| --------- | ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Queue     | `/app/print`            | Segmented control (Queued·Done·All); totals line; single column of cards; FAB **+** | Two-pane: list left, selected job right; column headers sortable | Open PDF                 | Empty: "Nothing to print — jobs you send from Reports or the Library appear here" · Skeleton cards · Retry banner |
| Job sheet | sheet over `/app/print` | Bottom sheet: metadata + stacked actions                                            | Right panel                                                      | Open PDF                 | "File expired — regenerate" state with a link to the report                                                       |
| New job   | sheet / dialog          | 2-step sheet: pick source → parameters; section picker is a full-screen list        | Dialog with a live sheet-count summary                           | Add to queue             | Upload progress; conversion failure message; quota message                                                        |
| Printers  | `/app/print/printers`   | List, read-only in v1, with the Windows-app sentence                                | Same                                                             | Add printer (label only) | "No printers added — you can still print from your browser"                                                       |
| My jobs   | `/app/print?mine=1`     | Filter chip                                                                         | Filter                                                           | —                        | "You haven't queued anything"                                                                                     |

Components: `AppShell`, `DataList`, `FormSheet`, `SegmentedControl`, `ConfirmSheet`, `FilePicker`, `EmptyState`, `StickyActionBar`, `CountBadge`.
Copy rules: every action button says what it actually does (_Open PDF_, _Mark printed_), and the queue header carries the sentence _"v1 prints from your browser. Printer connections come with the Acadigma Windows app."_ once, dismissible per user.

## 7. Server contracts

| Name                                  | Input                                                                                                                                                                                       | Output                                 | Errors                                                                                               | Idempotency          | Rate limit  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- | ----------- |
| `createPrintJob`                      | `CreatePrintJobInput` = `{ source, reportRunId? \| resourceId? \| uploadFileId?, kind, title, sectionId?, gradeLevelId?, copies?, duplex, colour, paperSize, priority, neededBy?, notes? }` | `PrintJob`                             | `plan_required`, `file_missing`, `file_expired`, `quota_exceeded`, `conversion_failed`, `validation` | client draft id      | 120/h/user  |
| `computeCopies` (route, GET)          | `{ sectionId? , gradeLevelId?, kind }`                                                                                                                                                      | `{ copies, note }`                     |                                                                                                      | —                    | 300/h       |
| `updatePrintJob`                      | `{ id, title?, copies?, notes?, neededBy?, priority?, duplex?, colour?, paperSize? }`                                                                                                       | `PrintJob`                             | `forbidden`, `not_queued`                                                                            | per id + version     | 300/h       |
| `markPrintJobPrinted`                 | `{ id }`                                                                                                                                                                                    | `PrintJob`                             | `forbidden`, `illegal_transition`                                                                    | per id + status      | 300/h       |
| `markPrintJobFailed`                  | `{ id, reason }`                                                                                                                                                                            | `PrintJob`                             | `reason_required`                                                                                    | per id + attempt     | 300/h       |
| `retryPrintJob`                       | `{ id }`                                                                                                                                                                                    | `PrintJob`                             | `not_failed`                                                                                         | per id + attempt     | 120/h       |
| `cancelPrintJob`                      | `{ id, reason? }`                                                                                                                                                                           | `PrintJob`                             | `forbidden`, `terminal`                                                                              | per id               | 300/h       |
| `bulkPrintJobAction`                  | `{ ids[], action: printed\|cancelled }`                                                                                                                                                     | `{ updated, skipped: [{id, reason}] }` | partial success is normal                                                                            | per id + action      | 60/h        |
| `GET /api/files/[id]`                 | —                                                                                                                                                                                           | 302 → signed URL (5 min), logged       | `forbidden` (creator or `print.manage` only)                                                         | —                    | 300/h       |
| `upsertPrinter` / `deactivatePrinter` | `{ … }`                                                                                                                                                                                     | `Printer`                              | `forbidden`                                                                                          |                      | 60/h        |
| **agent routes** (flag off in v1)     | see §5.6                                                                                                                                                                                    |                                        | `404` while the flag is off                                                                          | per job + transition | 600/h/agent |

## 8. Parts (build chunks)

**Part 1 — Schema, state machine, RLS** · `print_jobs` (with `requested_by`, stored `total_sheets`, `copies_source`, `failure_history`), `printers` without fake telemetry columns, `print_agents` reserved, the transition-guard trigger, the service-role-only guard on `claimed`/`printing`, RLS policies, `app.next_id` kind `print_job`. `packages/domain/print/stateMachine.ts` + `copies.ts` unit-tested.
_Demo:_ pgTAP shows a teacher cannot set `printing`, cannot edit someone else's job, and cannot see another workspace's queue; the state machine test enumerates every legal and illegal transition.

**Part 2 — Queue screens + human lifecycle** · `/app/print` at both viewports, segmented filters, sorting, totals line, job sheet, Open PDF with signed URLs and access logging, Mark printed / Mark failed (with reason) / Retry / Cancel, notifications to the requester, the dismissible v1 honesty banner.
_Demo:_ on a 360×800 phone, open a seeded job, download the PDF, mark it printed, and see the requester's notification arrive in a second browser context.

**Part 3 — Create from reports and library + roster copies** · the _Send to print queue_ action on `report_runs`, the source picker, `computeCopies` with the provenance note and the whole-grade sum, the `__none__` section option, the ID-card sheet-count rule.
_Demo:_ a 34-student section produces `copies=34` with the note; switching to "No specific class" leaves copies at 1 and never crashes the select.

**Part 4 — Uploads + PDF normalisation** · upload of PDF/DOC/DOCX/images to the private bucket, server-side conversion to PDF, page-count extraction, size and quota guards, estimated-page-count handling.
_Demo:_ upload a .docx notice; the queue shows a real page count and the downloaded file is a PDF.

**Part 5 — Bulk actions, retention, printers screen, agent scaffolding** · multi-select with the sticky bar, bulk mark-printed/cancel with partial-success reporting, the 90-day retention cron, the read-only printers screen with the Windows-app message, `print_agents` table + flag-gated routes returning 404, and the stale-claim sweeper (dormant in v1).
_Demo:_ select 6 jobs on a phone via long-press and mark them printed in one action; `curl` an agent route and receive 404 while the flag is off; the CI test asserting that stays green.

## 9. Acceptance criteria

**Creation and copies**

1. _Given_ a finished report run for Class 6 – A with 34 active enrolments and a 3-page card, _when_ a teacher sends it to the print queue, _then_ the job has `copies=34`, `pages_per_copy=3`, `total_sheets=102`, `copies_source='roster'` and a note naming the section and count time.
2. _Given_ the teacher edits copies to 36, _then_ `copies_source='manual'` and the original roster note is retained.
3. _Given_ a whole-grade job across 3 sections of 30/32/28, _then_ `copies=90`.
4. _Given_ "No specific class" is chosen, _when_ the select opens, _then_ no crash occurs and `copies` defaults to 1.
5. _Given_ an ID-card run for 34 students at 10-up, _then_ `copies=4` and the note says "4 sheets for 34 cards, 10 per sheet".
6. _Given_ a report run whose file has expired, _when_ the user tries to queue it, _then_ the action is refused with `file_expired` and a Regenerate link.
7. _Given_ a .docx upload, _then_ the stored file is a PDF with a real page count; _given_ a corrupt file, _then_ the job is refused with `conversion_failed` and nothing is queued.

**Lifecycle and honesty** 8. _Given_ a queued job, _when_ any user taps the primary action, _then_ it opens the PDF via a 5-minute signed URL and writes a `file_access_log` row — and **no request is made to any printer**. 9. _Given_ the v1 build, _when_ the entire client bundle is searched, _then_ there is no code path that sets `status='printing'`. 10. _Given_ a queued job, _when_ staff mark it printed, _then_ `status='printed'`, `completed_by` is that user, `completed_at` is set, and the requester receives a notification. 11. _Given_ a job marked failed, _then_ a reason is required, the job returns to the top of Queued, `attempt_count` is 1, and the reason is visible on the card. 12. _Given_ a printed job, _when_ anyone tries to edit it, _then_ the server returns `illegal_transition`. 13. _Given_ a non-service-role user, _when_ they attempt to set `status='claimed'` directly via the API or SQL, _then_ the write is rejected (pgTAP).

**Permissions** 14. _Given_ a teacher, _when_ they open another teacher's job, _then_ they can see it and open the PDF only if they created it or hold `print.manage`; the Cancel action is absent. 15. _Given_ a `staff` member, _then_ they can mark jobs printed or failed but cannot edit copies on someone else's job. 16. _Given_ a teacher, _when_ they attempt `deactivatePrinter`, _then_ the server returns `forbidden` — the §7.11 defect cannot recur. 17. _Given_ a parent, _when_ they request `/app/print`, _then_ they are redirected and the action returns `forbidden`. 18. _Given_ an admin of School A, _when_ they query `print_jobs` with their JWT, _then_ zero School B rows are returned.

**Queue behaviour** 19. _Given_ two queued jobs, one `urgent` created later, _then_ the urgent one sorts first. 20. _Given_ jobs with and without `needed_by`, _then_ dated jobs sort before undated ones within the same priority. 21. _Given_ the Queued filter with 18 jobs totalling 412 sheets, _then_ the header shows exactly "18 jobs · 412 sheets". 22. _Given_ a printed job older than 90 days, _when_ the retention cron runs, _then_ the row is deleted and any upload-source file is deleted with it.

**Phone** 23. _Given_ a 360×800 viewport, _when_ the queue renders with 40 jobs, _then_ there is no horizontal scroll, the FAB is thumb-reachable, and the primary action in the job sheet is a full-width 44 px button. 24. _Given_ a long-press on a card, _then_ multi-select activates and a sticky bar offers Mark printed and Cancel with the selected count.

**Printers / agent** 25. _Given_ the v1 build, _when_ the printers screen renders, _then_ it shows no status dot, no paper level, and the sentence naming the Windows app. 26. _Given_ the agent feature flag is off, _when_ any `/api/print/agent/*` route is called, _then_ it returns 404. 27. _Given_ the agent flag is on in a test environment, _when_ two agents claim concurrently, _then_ exactly one gets the job (single-statement atomic claim) and the other receives `no_jobs`.

## 10. Tests

- **Unit (`packages/domain/print`)**: the state machine (every pair of states, including service-role-only transitions and terminal edits); `computeCopies` (active-only counting, whole-grade sum, fallbacks, ID-card ceil); `total_sheets` and the duplex hint; the queue comparator (priority/needed_by/created_at, including null handling) as a property test asserting a total order.
- **DB (pgTAP)**: tenant isolation; creator-vs-manager update policies column by column; the transition-guard trigger rejecting `claimed`/`printing` from an authenticated role; delete restrictions; the atomic claim under `pg_sleep`-induced concurrency.
- **Integration**: create-from-report-run including expired files; upload conversion (docx/png → PDF) and page-count extraction; bulk action partial success; the stale-claim sweeper returning a `claimed` job after 15 minutes.
- **e2e (360×800 and 1280×800, axe)**: J1 report → send to queue → open PDF → mark printed → requester notified; J2 upload a notice with 25 copies → cancel → confirm sheet names the sheet count; J3 long-press multi-select → bulk mark printed; J4 printers screen shows the honest empty state; J5 a teacher cannot cancel another teacher's job (UI absence + server 403).
- **Static/CI**: a test that greps the client bundle for `'printing'` status writes and fails if found; a test asserting the agent routes 404 with the flag off; a copy test asserting no button label contains the word "Print" without either opening a file or marking a state (guards against re-introducing a lying button).
- **Performance budgets**: queue list p95 ≤ 600 ms for 500 jobs (cursor-paginated, server-filtered); `computeCopies` ≤ 120 ms; signed-URL issue ≤ 200 ms.

## 11. Open questions

1. **Who is the default printer operator?** _Default assumed:_ members with role `staff` plus admins. Schools without a `staff` member will have admins doing it; fine.
2. **Does a print job need an approval step for large sheet counts?** _Default assumed:_ no gate in v1, but jobs over 500 sheets show a confirmation naming the count and notify admins. A real quota is FUTURE.
3. **Exam papers and confidentiality.** An exam paper in a shared queue is a leak risk. _Default assumed:_ `kind='exam_paper'` jobs are visible to `{owner, admin, staff}` and the creator only, and their file access is logged with a distinct reason. Flagged for security review.
4. **Cost tracking (paper/toner per job)** is FUTURE; the sheet totals are the foundation it would build on.
5. **Scheduled printing** is deliberately omitted (§5.7). If a school asks, it belongs with the agent phase, where something can actually execute at a time.
6. **File retention mismatch**: report files expire at 30 days (F-OP-03) but print jobs are kept 90. _Default assumed:_ the job row survives with an "file expired" state and a Regenerate link; confirm with the data-model agent that this is preferable to extending file retention for queued files (it is, for storage cost).
