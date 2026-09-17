# F-OP-06 — Staff Directory and Records

|                  |                                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | ops                                                                                                                                                                                                                                            |
| Status           | planned                                                                                                                                                                                                                                        |
| Owner branch     | `feat/ops-staff`                                                                                                                                                                                                                               |
| Depends on       | F-ID-01/02 (profiles, memberships, invitations, custom labels), F-OP-01 (hire creates records), F-OP-02 (reads hourly rate), F-OP-05 (channel membership revoke), F-TI-0x (resource orphaning), F-AC-0x (section/section_subject reassignment) |
| Plan             | `docs/plan/ROADMAP.md` chunk TBD                                                                                                                                                                                                               |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §2.2 (`HiredStaff`), §3 rows 24–25, §4.1, §7.5, §8 Q6, Q18; PRODUCT-DECISIONS §1.4, §1.14, §3.7, §6.3                                                                                       |

---

## 1. Purpose

Every other operations feature assumes there is a row that says _this person works here, in this role, from this date, at this rate_. **Staff Directory and Records** is that row, plus the screens around it: a searchable list of everyone in the school with their designation and subjects; a record per person holding employment details, documents and (admin-only) pay; and an offboarding checklist that, when completed, actually removes access instead of leaving a former employee with a live login.

**What Base44 intended and what was fake.** `HiredStaff` was a four-boolean onboarding checklist (contract signed / ID issued / orientation done / system access) with **no tenant field and no `.create()` anywhere in the codebase** (§2.2, §7.5) — so the Onboarding Tracker tab was permanently empty. Its "View" button set a state variable that was never rendered, so it did nothing (§3 row 25). There was **no link back to `Applicant` or `User`**, so a hire could not become a staff member. There was **no hourly-rate field on any entity**, which is exactly why the whole cover-teacher payroll surface could not compute a single number (§8 Q6). Membership removal semantics did not exist; the security review found removed staff keeping access (PRODUCT-DECISIONS §1.14). "Principal" was a role in three different vocabularies instead of a label (§1.4).

**Done looks like:** the school's people are one list; a new hire from F-OP-01 arrives with their record already started; `Principal`, `Vice-Principal` and `Senior Teacher` are display labels over the five real roles; the hourly rate needed by cover payroll exists, is versioned, and only owners and admins can see it; and when someone leaves, a seven-step checklist reassigns their classes, orphans their resources for a colleague to claim, and revokes their access in one transaction with an audit trail.

## 2. Roles and permissions

| Action                                                         | Permission key             | owner | admin | teacher | staff | parent | platform |
| -------------------------------------------------------------- | -------------------------- | :---: | :---: | :-----: | :---: | :----: | :------: |
| View staff directory (name, label, subjects, work email/phone) | `staff.view`               |  ✅   |  ✅   |   ✅    |  ✅   |   —    |   read   |
| View a staff record (employment details, documents)            | `staff.record.view`        |  ✅   |  ✅   |   own   |  own  |   —    |    —     |
| Create / edit a staff record                                   | `staff.record.write`       |  ✅   |  ✅   |  own¹   | own¹  |   —    |    —     |
| Upload a staff document                                        | `staff.document.write`     |  ✅   |  ✅   |   own   |  own  |   —    |    —     |
| Open another member's staff document                           | `staff.document.view`      |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| View compensation (hourly rate / salary)                       | `staff.compensation.view`  |  ✅   |  ✅   |   own   |  own  |   —    |    —     |
| Set compensation                                               | `staff.compensation.write` |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Invite a member                                                | `member.invite`            |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Change a member's role                                         | `member.role.write`        |  ✅   |  ✅²  |    —    |   —   |   —    |    —     |
| Manage custom labels                                           | `settings.labels.write`    |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Start / complete an offboarding                                | `offboarding.run`          |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Transfer ownership                                             | `workspace.transfer`       |  ✅   |   —   |    —    |   —   |   —    |    —     |

¹ A member may edit **their own** contact fields, emergency contact and personal documents; employment fields (`employment_type`, `designation`, `joined_on`, `employment_status`) are admin-only even on your own record.
² An admin may not promote anyone to `owner` and may not change an owner's role. The last owner cannot be removed or downgraded (PRODUCT-DECISIONS §1.5).

**Plan entitlement:** the directory and records are available on **Free**; `custom_labels` are **Pro** (PRODUCT-DECISIONS §5.1) — without it, the directory shows the base role name.

## 3. Data

> **Proposed; `docs/architecture/DATA-MODEL.md` wins.**

### 3.1 `staff_records`

| Column                                                 | Type                            | Notes                                                                                           |
| ------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `workspace_id`                                         | uuid                            | tenant key                                                                                      |
| `user_id`                                              | uuid null → `profiles`          | null only for a pre-hire placeholder; set at hire                                               |
| `membership_id`                                        | uuid null → `workspace_members` | set when the invitation is accepted                                                             |
| `staff_code`                                           | text                            | `TCH-2026-014` / `ADM-2026-003` via `app.next_id(workspace_id, kind)`                           |
| `full_name`                                            | text not null                   | snapshot; the live name comes from `profiles` when linked                                       |
| `designation_label_id`                                 | uuid null → `custom_labels`     | the display title ("Principal")                                                                 |
| `department`                                           | text                            |                                                                                                 |
| `employment_type`                                      | enum                            | `full_time \| part_time \| contract \| substitute \| volunteer`                                 |
| `employment_status`                                    | enum `staff_status`             | `pending_join \| active \| on_notice \| left`                                                   |
| `joined_on`, `left_on`                                 | date                            |                                                                                                 |
| `work_email`, `work_phone`                             | text                            | directory-visible                                                                               |
| `personal_phone`                                       | text                            | record-visible only                                                                             |
| `emergency_contact`                                    | jsonb                           | `{name, relation, phone}`                                                                       |
| `blood_group`, `date_of_birth`, `gender`, `nid_number` |                                 | record-visible only; `nid_number` masked to last 4 in the UI                                    |
| `address`                                              | text                            |                                                                                                 |
| `qualifications`                                       | jsonb                           | `[{degree, institution, year}]`                                                                 |
| `subject_ids`                                          | uuid[]                          | what they can teach (distinct from what they are _assigned_, which lives in `section_subjects`) |
| `notes`                                                | text                            | admin-only                                                                                      |
| `application_id`                                       | uuid null                       | provenance from F-OP-01                                                                         |
| `created_by`                                           | uuid                            |                                                                                                 |

Unique `(workspace_id, user_id)` where `user_id is not null`; unique `(workspace_id, staff_code)`.
Index `(workspace_id, employment_status)`, `(workspace_id, designation_label_id)`.
RLS: select for `has_role(workspace_id,'{owner,admin}')` or `user_id = app.current_user_id()`; a **directory view** `staff_directory` exposes the safe subset (name, photo, label, base role, department, subjects, work email/phone, status) to all active non-parent members; insert/update by owner/admin, with a column-scoped self-update policy for the personal fields listed in §2¹.

### 3.2 `staff_compensation` — **a separate table, deliberately**

`(workspace_id, staff_record_id, hourly_rate_paisa bigint null, monthly_salary_paisa bigint null, currency char(3) default 'BDT', effective_from date not null, effective_to date null, note, created_by, created_at)`.

Postgres RLS is row-level, not column-level. Keeping `hourly_rate` on `staff_records` would mean either exposing it to everyone who can read the record or forbidding teachers from reading their own record at all. A separate table with its own policy solves it cleanly, **and** gives the historical snapshot that cover payroll needs (F-OP-02 §5.5 must use the rate that was in force on the day of the cover, not today's).

- One row per change; `effective_to` is closed by a trigger when a newer row is inserted; no gaps, no overlaps (exclusion constraint on `(staff_record_id, daterange(effective_from, effective_to))`).
- RLS: select/insert/update for `has_role(workspace_id,'{owner,admin}')`; select for `staff_records.user_id = app.current_user_id()` (you may see your own pay).
- The engine reads through `app.staff_hourly_rate(user_id uuid, on_date date) returns bigint` — `SECURITY DEFINER`, `STABLE`, search_path pinned, returning only the single number for the given date and **only** when the caller is an active member of the same workspace. Nothing else may read the table on a teacher's behalf.

### 3.3 `staff_documents`

`(workspace_id, staff_record_id, kind enum nid|passport|degree|certificate|contract|appointment_letter|police_clearance|photo|other, file_id → files (private), label, issued_on, expires_on, verified_by, verified_at, uploaded_by)`.
Index `(workspace_id, expires_on) where expires_on is not null` — the directory surfaces expiring documents (a contract ending in 30 days is an operational fact).
RLS: owner/admin full; the member may select and insert their own; nobody else, ever. Access via `/api/files/[id]` guarded by `app.can_open_staff_document(file_id)` and logged.

### 3.4 `custom_labels` (shared with F-ID-02, used here)

`(workspace_id, base_role enum owner|admin|teacher|staff|parent, label text, plural_label text null, sort_order int, is_active bool)`.
**Permissions come only from `base_role`** (PRODUCT-DECISIONS §1.4). A label is a display string and a sort key — nothing more. Seeded defaults for a new school: Principal → `admin`, Vice-Principal → `admin`, Head Teacher → `teacher`, Senior Teacher → `teacher`, Assistant Teacher → `teacher`, Coordinator → `admin`, Office Assistant → `staff`, Accountant → `staff`, Librarian → `staff`, Guardian → `parent`.
A test asserts that `permissions.can()` never reads `custom_labels`.

### 3.5 `offboardings`

`(workspace_id, staff_record_id, initiated_by, initiated_at, effective_date date not null, reason enum resigned|contract_ended|terminated|retired|transferred|other, reason_note, status enum in_progress|completed|cancelled, steps jsonb, completed_at, completed_by, cancelled_reason)`.
`steps` is an ordered array of `{key, label, required, status: pending|done|skipped, done_by, done_at, note, payload}` — materialised from a template at creation so a checklist that shipped last term stays reproducible.
RLS: owner/admin only.

### 3.6 Tables read / written elsewhere

`workspace_members` (status transitions), `workspace_invitations`, `profiles`, `sections` (class teacher), `section_subjects`, `resources` (orphaning), `channel_members` (revoke), `cover_priority_lists` (removal), `cover_assignments` (open assignments), `print_jobs` (open jobs), `report_runs`, `audit_events`, `notifications`, `files`.

## 4. Workflows

### W1 — The directory

Trigger: any member opens `/app/staff`.

1. **Phone:** a search field pinned under the title, a horizontal chip row of filters (All · Teachers · Admin · Staff · On notice · Pending), then a single column of person rows (avatar, name, designation label with the base role as a small secondary chip, subjects). **Desktop:** the same data as a table with sortable columns and a detail panel.
2. Tapping a person opens their **profile sheet** (phone) / panel (desktop): the directory fields plus, for those with `staff.record.view`, the employment block, documents and compensation.
3. Quick actions on the row: Message (F-OP-05), Call (`tel:` — and for a staff member this does **not** open a contact log; the contact log is for guardians), View timetable, Edit record.
   Empty state: a brand-new school shows the owner alone with "Invite your teachers" as the primary action.

### W2 — Create a record

Three entry points, one record:

- **From a hire** (F-OP-01 W9): the record exists at `pending_join` before the person has an account.
- **From an invitation**: inviting a member offers "also create a staff record" (default on for `teacher`/`staff`/`admin` roles).
- **Manually**: for someone already in the workspace who has no record (the backfill path for existing schools).
  On invitation acceptance a trigger links `membership_id` and flips `employment_status` to `active` with `joined_on` = the acceptance date (unless an earlier date was set at hire).

### W3 — Edit a record

A sectioned form in a sheet (phone) / dialog (desktop): **Identity**, **Employment** (admin-only), **Contact**, **Qualifications & subjects**, **Documents**, **Compensation** (behind `staff.compensation.view`). Each section saves independently, so a teacher updating their phone number does not need to re-validate the employment block. Every write is audited; changes to `employment_type`, `designation_label_id` and compensation notify the member ("Your designation was changed to Senior Teacher").

### W4 — Compensation

Trigger: admin opens the Compensation section.

1. Shows the current rate with its `effective_from`, and the history beneath.
2. **Set new rate** asks for the amount, the effective date (defaults to the first of next month) and an optional note. Saving closes the previous row's `effective_to` and inserts a new one — it never edits history.
3. A teacher opening their own record sees the same section, read-only, with only their own numbers.
   Failures: an effective date that overlaps an existing period is rejected by the exclusion constraint with a readable message; setting a rate on a `left` record warns but is allowed (back-pay happens).

### W5 — Documents

Upload with a kind, an optional label and expiry. Private bucket. The record shows expiring documents with an amber chip at 60 days and red at 14. A nightly job notifies admins of documents expiring in 30 days (`staff.document.expiring`).

### W6 — Offboarding (the checklist that actually revokes)

Trigger: admin taps **Start offboarding** on a record.

1. Sheet: effective date, reason, note. Creates `offboardings{status:'in_progress'}` with the seven steps (§5.3) and sets `staff_records.employment_status='on_notice'`.
2. The checklist screen shows each step with its blocking status and an inline action:
   - **1. Confirm last working day** — date; everything below is scheduled against it.
   - **2. Reassign teaching** (blocking) — lists every `section_subjects` row and every section where they are class teacher, with a picker per row. Cannot be marked done while any assignment remains.
   - **3. Resources** (blocking) — count of school-library resources they own; choose _Reassign all to…_ or _Mark orphaned for an admin to sort_ (PRODUCT-DECISIONS §3.7). Personal-workspace resources are untouched and the UI says so.
   - **4. Cover and queue** — cancels their open `cover_assignments` (both as absent and as cover), removes them from every `cover_priority_lists`, and cancels their `queued` print jobs (or reassigns `requested_by` to the admin).
   - **5. Revoke access** (the transaction, §5.4).
   - **6. Assets and documents** — free text checklist (ID card, keys, laptop) with per-item notes; not blocking.
   - **7. Final pay note** — records outstanding cover credits from F-OP-02 as a note for the payroll run; not blocking.
3. **Complete offboarding** runs step 5 if it has not run, sets `employment_status='left'`, `left_on`, `offboardings.status='completed'`, and writes one audit event summarising every consequence.
   Failures: any blocking step incomplete → Complete is disabled with the reason named; offboarding the **last owner** is refused (transfer ownership first); cancelling an offboarding restores `employment_status='active'` and reverses nothing else (nothing destructive has happened before step 5).

### W7 — Rejoining

A former member invited again reuses their existing `staff_records` row: `employment_status` returns to `pending_join`, a new `joined_on` is recorded and the previous stint is preserved in `employment_history jsonb[]`. Their old messages, marks and audit trail keep their attribution — **no membership row is ever deleted** (PRODUCT-DECISIONS §1.14).

## 5. Business rules and calculations

### 5.1 Labels vs roles

`display_title(member) = custom_labels.label of staff_records.designation_label_id, else the default label for the base role`.
The base role is always visible somewhere on the screen (a small chip), because a school where nobody can tell who has admin rights is a school with an access problem. Sorting the directory uses `custom_labels.sort_order` then name.

### 5.2 Status machine

```
pending_join ──(invitation accepted)──▶ active ──(offboarding started)──▶ on_notice ──(completed)──▶ left
     │                                     │                                    │
     └──(invitation expired/cancelled)─────┴──(offboarding cancelled)───────────┘
                    ▼
              stays pending_join (with a "Resend invitation" action)
```

`left → pending_join` only through W7. `active` requires a linked `membership_id` with `workspace_members.status='active'` — a trigger keeps the two in step, so "a staff record says active but the person has no access" cannot happen.

### 5.3 Offboarding checklist template

| #                                                                                                           | Key                 | Label                         | Required | Effect                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------- | -------- | ------------------------------------------------------------------ |
| 1                                                                                                           | `last_day`          | Confirm last working day      | ✅       | sets `effective_date`                                              |
| 2                                                                                                           | `reassign_teaching` | Reassign classes and subjects | ✅       | updates `section_subjects.teacher_id`, `sections.class_teacher_id` |
| 3                                                                                                           | `resources`         | Reassign or orphan resources  | ✅       | `resources.status='orphaned'` or reassigned owner                  |
| 4                                                                                                           | `cover_and_queue`   | Clear cover and print queue   | —        | cancels/reassigns rows                                             |
| 5                                                                                                           | `revoke_access`     | Revoke access                 | ✅       | §5.4                                                               |
| 6                                                                                                           | `assets`            | Collect assets and documents  | —        | notes only                                                         |
| 7                                                                                                           | `final_pay`         | Note outstanding pay          | —        | summarises unpaid cover credits                                    |
| A school may add custom steps (`offboarding_template` in F-OP-07) but cannot remove the four required ones. |

### 5.4 The revoke transaction (single transaction, idempotent)

```
1.  workspace_members: status='removed', removed_at=now(), removed_by=actor
2.  staff_records:     employment_status='left', left_on = effective_date
3.  channel_members:   left_at = now() for every channel in this workspace
4.  conversation_participants: left_at = now()   (DM history preserved, read-only)
5.  resources owned in this workspace: status='orphaned' (unless reassigned in step 3 of the checklist)
6.  cover_priority_lists: remove the user from every entries[] array
7.  cover_assignments:  proposed/notified/acknowledged rows for this user (either side) → cancelled, reason='member_removed'
8.  print_jobs:         queued rows requested_by this user → cancelled, reason='member_removed'
9.  workspace_invitations: any pending invitation for this email in this workspace → cancelled
10. auth: revoke refresh tokens for this user's sessions scoped to this workspace context; the next request re-resolves WorkspaceContext and 403s
11. notifications: the member is told, and owners/admins receive a summary
12. audit_events: one row with a before/after summary of everything above
```

Because RLS checks `workspace_members.status='active'` on every policy (ARCHITECTURE §3), step 1 alone is what actually ends access; steps 3–9 are hygiene so the school is not left with dangling work. **Nothing is deleted.** The member keeps their personal workspace, their own resources there, and their account.

### 5.5 Seat counting

`seats_used = count(workspace_members where status in ('active','pending') and role in ('owner','admin','teacher','staff'))`. Parents do not consume seats. The plan's teacher limit (PRODUCT-DECISIONS §5.1) is checked on invitation and on hire; exceeding it blocks with an upgrade path, never by silently failing.

### 5.6 Document expiry

```
expiring_soon = staff_documents where expires_on between today and today + 30 days
expired       = staff_documents where expires_on < today
```

Computed in workspace timezone. Surfaced on the record, on the directory row as a small chip, and in a nightly admin notification.

### 5.7 Privacy rules

- `nid_number` is stored whole and displayed masked (`•••• 4471`) except to owners/admins, and never appears in the directory view, in exports below admin level, or in any PDF other than a contract.
- `staff_documents` files are `private` with a per-file access check and a logged download.
- Compensation is never included in a directory export; the staff export for admins includes it only when `include_compensation` is explicitly ticked, and that tick is audited.
- A member's own record is always visible to them (they should know what their employer holds).

## 6. UI

| Screen       | Route                         | 360×800                                                                          | ≥1024                              | Primary action       | Empty / loading / error                                                      |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| Directory    | `/app/staff`                  | Search + filter chips + person rows                                              | Table + detail panel               | Invite member        | "Just you so far — invite your teachers" · Skeleton rows · Retry banner      |
| Person sheet | sheet / panel                 | Bottom sheet: identity, quick actions, sections                                  | Right panel                        | Message              | Own-record view shows an "Edit my details" affordance                        |
| Record       | `/app/staff/[id]`             | Sectioned accordions, each independently saved                                   | Two-column with a section rail     | Save section         | Locked sections show "Admins only" rather than hiding silently               |
| Compensation | section within the record     | Current rate card + history list                                                 | Same                               | Set new rate         | "No rate set — cover payroll cannot calculate credit" with a link to F-OP-02 |
| Documents    | section within the record     | Upload tile + file rows with expiry chips                                        | Same                               | Upload               | "No documents"                                                               |
| Labels       | `/app/settings/labels`        | List with drag ordering, add/edit sheet                                          | Two-pane                           | Add label            | Pro upgrade card on Free/Starter                                             |
| Offboarding  | `/app/staff/[id]/offboarding` | Vertical stepper; each step a card with an inline action; blocking steps flagged | Two-pane: steps left, action right | Complete offboarding | Blocked-state explains exactly which assignments remain                      |
| Invite       | sheet / dialog                | Email/phone, role, label, "create staff record" switch                           | Dialog                             | Send invitation      | Seat-limit message with the plan's number                                    |

Components: `AppShell`, `DataList`, `FormSheet`, `SegmentedControl`, `PersonRow`, `RoleChip`, `MoneyText`, `FileRow`, `ExpiryChip`, `Stepper` (new), `ConfirmSheet`, `EmptyState`.
Phone specifics: the directory search is the first focusable element; filter chips scroll horizontally but the list never does; the offboarding stepper's primary action per step sits in a sticky bottom bar; destructive confirmations (Complete offboarding) require typing nothing but do name every consequence in the sheet.

## 7. Server contracts

| Name                                            | Input                                                                            | Output                                 | Errors                                              | Idempotency                | Rate limit |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | -------------------------- | ---------- |
| `listStaff` (route, GET)                        | `{ query?, role?, status?, departmentId?, cursor }`                              | `Page<StaffDirectoryRow>`              |                                                     | —                          | 300/h      |
| `createStaffRecord`                             | `CreateStaffRecordInput`                                                         | `StaffRecord`                          | `duplicate_user`, `forbidden`, `seat_limit_reached` | client draft id            | 60/h       |
| `updateStaffRecord`                             | `{ id, section: 'identity'\|'employment'\|'contact'\|'qualifications', patch }`  | `StaffRecord`                          | `forbidden_section`, `validation`                   | per id + section + version | 300/h      |
| `setStaffCompensation`                          | `{ staffRecordId, hourlyRatePaisa?, monthlySalaryPaisa?, effectiveFrom, note? }` | `StaffCompensation`                    | `forbidden`, `overlapping_period`, `nothing_to_set` | per record + effectiveFrom | 60/h       |
| `getStaffCompensation` (route, GET)             | `{ staffRecordId }`                                                              | `StaffCompensation[]`                  | `forbidden`                                         | —                          | 300/h      |
| `uploadStaffDocument`                           | `{ staffRecordId, kind, fileId, label?, issuedOn?, expiresOn? }`                 | `StaffDocument`                        | `forbidden`, `quota_exceeded`                       | per file                   | 120/h      |
| `deleteStaffDocument`                           | `{ id }`                                                                         | `{ ok }`                               | `forbidden`                                         |                            | 60/h       |
| `upsertCustomLabel` / `reorderCustomLabels`     | `{ … }`                                                                          | `CustomLabel[]`                        | `plan_required`, `label_in_use` (on delete)         |                            | 60/h       |
| `inviteMember`                                  | `{ emailOrPhone, role, designationLabelId?, createStaffRecord }`                 | `{ invitationId, staffRecordId? }`     | `seat_limit_reached`, `already_member`, `forbidden` | per email + role           | 60/h       |
| `changeMemberRole`                              | `{ membershipId, role }`                                                         | `WorkspaceMember`                      | `forbidden`, `last_owner`, `cannot_promote_owner`   | per membership + role      | 60/h       |
| `startOffboarding`                              | `{ staffRecordId, effectiveDate, reason, note? }`                                | `Offboarding`                          | `already_in_progress`, `last_owner`                 | per record                 | 30/h       |
| `updateOffboardingStep`                         | `{ offboardingId, stepKey, status, payload?, note? }`                            | `Offboarding`                          | `blocking_incomplete`, `forbidden`                  | per step + status          | 300/h      |
| `completeOffboarding`                           | `{ offboardingId }`                                                              | `{ removed: true, consequences: {…} }` | `blocking_incomplete`, `last_owner`                 | **required**               | 30/h       |
| `cancelOffboarding`                             | `{ offboardingId, reason }`                                                      | `Offboarding`                          | `already_completed`                                 |                            | 30/h       |
| `exportStaff`                                   | `{ includeCompensation: boolean }`                                               | `report_runs` row (F-OP-03)            | `forbidden`                                         |                            | 10/h       |
| `GET /api/files/[id]`                           | —                                                                                | 302 signed URL                         | `forbidden` via `app.can_open_staff_document`       | —                          | 300/h      |
| `app.staff_hourly_rate(user_id, on_date)` (SQL) | —                                                                                | `bigint`                               | null when unset                                     | —                          | —          |

## 8. Parts (build chunks)

**Part 1 — Schema, RLS, the compensation split** · `staff_records`, `staff_compensation` (with the exclusion constraint and period-closing trigger), `staff_documents`, `custom_labels` seeding, the `staff_directory` view, `app.staff_hourly_rate`, `app.can_open_staff_document`, the membership↔record status trigger.
_Demo:_ pgTAP shows a teacher can read their own record and their own rate, cannot read a colleague's rate by any query, and `app.staff_hourly_rate` returns the rate in force on a past date rather than today's.

**Part 2 — Directory + person sheet** · `/app/staff` at both viewports, server-side search and filters, cursor pagination, label + role chips, quick actions, own-record affordance, invite entry point.
_Demo:_ at 360×800, search "Nadia", open her sheet, message her, and see her subjects and designation — with the base role visible as a chip.

**Part 3 — Record editor + documents** · sectioned form with per-section permissions and independent saves, qualifications and subjects, document upload with kind/expiry, expiry chips and the nightly notification, private-file access checks and logging.
_Demo:_ a teacher edits their own phone number but is refused on `employment_type`; an admin uploads a contract expiring in 20 days and sees the amber chip and tomorrow's notification queued.

**Part 4 — Compensation + custom labels** · the compensation section with history and the new-rate flow, the self-view, `custom_labels` CRUD with drag ordering and the Pro gate, the "permissions never read labels" test.
_Demo:_ set ৳400/h effective 1 Oct; F-OP-02's engine picks it up for an October cover and uses the previous rate for a September one.

**Part 5 — Offboarding** · `offboardings` with the step template, the stepper UI with blocking logic, reassignment pickers for sections and section-subjects, the resource orphan/reassign choice, the revoke transaction with its twelve effects, cancellation, rejoining, and the audit summary.
_Demo:_ offboard a teacher who has 4 section-subjects, 12 resources and 2 queued print jobs; after Complete, their login gets a 403 within one request, the 4 classes have new teachers, the 12 resources are orphaned and claimable, and one audit event names all of it.

## 9. Acceptance criteria

**Directory and records**

1. _Given_ an active school, _when_ any non-parent member opens `/app/staff`, _then_ they see every active member with name, designation label and base-role chip — and no compensation, NID or document data in the network payload.
2. _Given_ a `parent` member, _when_ they request `/app/staff`, _then_ they are redirected and `listStaff` returns `forbidden`.
3. _Given_ a teacher, _when_ they open their own record, _then_ they can edit contact and emergency fields; _when_ they patch `employment_type`, _then_ the server returns `forbidden_section`.
4. _Given_ an admin, _when_ they change a member's designation, _then_ the member receives a notification and an `audit_events` row exists.
5. _Given_ a workspace without the Pro plan, _when_ an admin opens labels, _then_ they see the upgrade card and the directory shows base-role names.
6. _Given_ any label configuration, _when_ `permissions.can()` is called, _then_ it reads only the base role (unit test asserts `custom_labels` is never imported by the permissions module).

**Compensation** 7. _Given_ an admin sets ৳400/h effective 1 Oct on a record that had ৳350/h from 1 Jan, _then_ the old row's `effective_to` becomes 30 Sep and no overlap exists. 8. _Given_ an overlapping effective period, _then_ the insert is refused with `overlapping_period` and a readable message. 9. _Given_ a cover on 15 Sep, _when_ F-OP-02 computes credit, _then_ it uses ৳350/h, not ৳400/h. 10. _Given_ a teacher, _when_ they query `staff_compensation` directly with their JWT, _then_ they receive only their own rows (pgTAP). 11. _Given_ a `staff` member, _when_ they call `setStaffCompensation`, _then_ the server returns `forbidden`. 12. _Given_ no compensation row, _then_ `app.staff_hourly_rate` returns null and the cover payroll shows "Rate not set" rather than 0.

**Documents** 13. _Given_ a document with `expires_on` in 20 days, _then_ the record shows an amber chip and the nightly job notifies admins. 14. _Given_ a colleague (not owner/admin), _when_ they request another member's document file id, _then_ the response is 403 and the attempt is logged. 15. _Given_ an admin downloads an NID, _then_ a `file_access_log` row exists naming the actor and the file. 16. _Given_ the directory view, _then_ `nid_number` is absent from the payload entirely; on the record it renders masked to the last 4 for non-admins viewing their own record.

**Hire integration** 17. _Given_ a hire from F-OP-01, _then_ a `staff_records` row exists at `pending_join` with `application_id` set before the candidate has accepted anything. 18. _Given_ the candidate accepts the invitation, _then_ `employment_status='active'`, `membership_id` is linked and `joined_on` is set. 19. _Given_ an invitation that expires, _then_ the record stays `pending_join` and the directory offers "Resend invitation". 20. _Given_ a plan teacher limit of 20 with 20 seats used, _when_ an admin invites a 21st, _then_ the server returns `seat_limit_reached` naming the plan's limit.

**Offboarding** 21. _Given_ a teacher with 4 `section_subjects` rows, _when_ an admin tries to complete the offboarding without reassigning them, _then_ Complete is disabled and the server returns `blocking_incomplete` naming the 4 assignments. 22. _Given_ all blocking steps done, _when_ the admin completes, _then_ in one transaction: membership is `removed` with `removed_at`/`removed_by`, the staff record is `left` with `left_on`, channel and conversation participations are closed, the member's school resources are `orphaned`, they are removed from every cover priority list, their open cover assignments and queued print jobs are cancelled, and pending invitations for their email are cancelled. 23. _Given_ that completion, _when_ the former member makes their next request with a still-valid JWT, _then_ `WorkspaceContext` resolution fails and the server returns 403. 24. _Given_ that completion, _then_ exactly one `audit_events` row summarises every consequence, and no rows anywhere were deleted. 25. _Given_ the offboarding of the last remaining owner, _then_ the action is refused with `last_owner` and the UI points to ownership transfer. 26. _Given_ an in-progress offboarding, _when_ it is cancelled, _then_ `employment_status` returns to `active` and nothing else changed (because step 5 had not run). 27. _Given_ a former member who is re-invited, _then_ the original `staff_records` row is reused, the previous stint is preserved in `employment_history`, and their old messages and marks keep their attribution. 28. _Given_ an offboarded teacher's orphaned resources, _when_ an admin opens the library, _then_ those resources are listed as orphaned and can be reassigned or archived — and their **personal-workspace** resources are untouched.

**Tenancy** 29. _Given_ an admin of School A, _when_ they query `staff_records`, `staff_compensation` or `staff_documents` with their JWT, _then_ zero School B rows are returned (pgTAP, all three tables). 30. _Given_ a member of two schools, _then_ they have two independent staff records and two independent rates, and neither leaks into the other.

**Phone** 31. _Given_ a 360×800 viewport, _when_ the directory renders with 80 members, _then_ search is reachable without scrolling, the list has no horizontal scroll, and the offboarding stepper's primary action is in the thumb zone.

## 10. Tests

- **Unit**: `display_title` resolution with and without a label and without the Pro plan; the status machine (every transition, including rejoin); seat counting (parents excluded, pending included); the effective-period closing logic; document expiry bucketing across the workspace timezone boundary; the offboarding step template validation (required steps cannot be removed).
- **DB (pgTAP)**: isolation and escalation on `staff_records`, `staff_compensation`, `staff_documents`, `offboardings`; the column-scoped self-update policy field by field; the compensation exclusion constraint under concurrent inserts; `app.staff_hourly_rate` returning the historical rate and refusing a caller from another workspace; the membership↔record status trigger.
- **Integration**: the revoke transaction's twelve effects asserted individually and as a rollback on a forced failure at step 7; `completeOffboarding` idempotency on a double submit; hire → accept → status linkage; seat-limit enforcement on both invite and hire.
- **e2e (360×800 and 1280×800, axe)**: J1 invite → accept → record active; J2 teacher edits own contact, is refused on employment; J3 set a rate and verify a September vs October cover credit; J4 full offboarding with reassignment and the 403 afterwards; J5 re-invite a former member and see the history preserved.
- **Security**: attempts to read a colleague's compensation through every available query path (direct table, view, RPC, export); NID masking in every response shape; an export with `includeCompensation` from a non-owner.
- **a11y**: the stepper communicates step state to screen readers (`aria-current`, completed/blocked announced); masked fields have an accessible description; the directory list rows are links with meaningful names.
- **Performance budgets**: directory list p95 ≤ 500 ms at 500 members (server-filtered, cursor-paginated); `app.staff_hourly_rate` ≤ 5 ms (indexed, `STABLE`, callable in a loop by the cover engine); the revoke transaction ≤ 1.5 s for a member with 50 resources and 20 assignments.

## 11. Open questions

1. **Compensation table vs column.** This spec argues strongly for `staff_compensation` as a separate, period-versioned table because RLS is row-level and cover payroll needs historical rates. If DATA-MODEL.md puts `hourly_rate` on `staff_records`, F-OP-02 still works through `app.staff_hourly_rate` but loses the snapshot guarantee and exposes the rate to anyone who may read the record. **Flagged to the data-model agent as the single most important call in this feature.**
2. **Full payroll** (salary runs, deductions, payslips) is **not** in Campus v1. This feature stores the rate and the cover credits; the payroll _run_ is FUTURE. The monthly cover payroll-impact report (F-OP-02 §5.6) is the bridge.
3. **Leave balances and leave types** are owned by the staff-attendance feature in the academics area; this record links to them but does not define them. Confirm ownership.
4. **Staff performance reviews / appraisals** are out of scope for v1.
5. **`staff` role scope.** _Default assumed:_ `staff` means non-teaching employees (office, accounts, library, support) with no academic write permissions. Confirm the permission matrix with the identity area.
6. **Multi-campus.** One workspace = one campus (PRODUCT-DECISIONS §7); a teacher at two campuses is two memberships and two records, and this spec accepts that.
