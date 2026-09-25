# F-AC-03 — Student attendance

|                  |                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                                                                           |
| Status           | in progress — demo cut shipped (D-104), follow-ups (D-105)                                                                                                                                          |
| Owner branch     | `feat/academics-attendance`                                                                                                                                                                         |
| Depends on       | F-AC-01 (sections), F-AC-02 (students, enrollments, ID-card QR), F-AC-11 (calendar/working days), F-AC-05 (optional: period-level sessions)                                                         |
| Plan             | `docs/plan/ROADMAP.md` chunk 4                                                                                                                                                                      |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (Attendance vs AttendanceLog), §3 features 18–21, 58, §4.1 step 5, §5 (attendance formulas), §6 items 1–3, 5, 8–10, 35, 41, §7 Q1, Q2, Q12 |

## 1. Purpose

Attendance is the feature a school uses every single morning, usually on a phone, usually with one hand while holding a register. A class teacher opens their section to an **unmarked** roster, taps **"Mark all present" (সবাই উপস্থিত)** as one explicit action, flips the handful of absentees, and saves — target: **under 30 seconds for 40 students**. Attendance no longer defaults or silently pre-fills to present (D-22): every record that ends up `present` traces to either an individual tap or the audited bulk action. Everything downstream depends on it: the parent portal, low-attendance alerts, exam eligibility, the monthly register that the school prints for its file, and the risk score. "Done": every working day has a saved session per section, the monthly register prints correctly, parents see the same percentage the teacher sees, and it all works with no signal in the school building.

**Base44 intent vs reality.** Attendance was modelled **twice and wired to neither**. The `Attendance` entity (daily roll-call: student, class, date, status) was read by six screens and **written by nothing**. The only roll-call UI wrote `AttendanceLog` — a gate-scanner event log with no `class_id`, no `date`, **no `workspace_id` and no RLS**, i.e. global across every school on the platform. The screen was dressed as a live scanner with five hardcoded fake scans and a static "Live" pill; a "Recovery Protocol" modal showed three invented missed items and a "Confirm & Print" button that printed nothing. The filter bar keyed on `student.grade`, a field that does not exist, so the grade dropdown was permanently empty. Two different attendance percentages were computed on two screens for the same child (late counted as absent on one, present on the other). PRODUCT-DECISIONS 2.1 and 2.2 settle it: **daily roll-call per section is the primary model**, late and half-day count as present by default, scan events are a later _input_ that pre-fills a session, and the fake live feed is dropped.

## 2. Roles and permissions

| Action                                                        | Permission key            | owner                            | admin | teacher                                                                                 | staff | parent            | platform |
| ------------------------------------------------------------- | ------------------------- | -------------------------------- | ----- | --------------------------------------------------------------------------------------- | ----- | ----------------- | -------- |
| Open the roll-call screen for a section                       | `attendance.take`         | yes                              | yes   | any teacher, any section (substitutes cover, D-105)                                     | no    | no                | no       |
| Save / update a session inside the edit window                | `attendance.write`        | yes                              | yes   | any teacher, any section (D-105)                                                        | no    | no                | no       |
| Edit a session after the edit window                          | `attendance.write_late`   | yes                              | yes   | no (must request from admin)                                                            | no    | no                | no       |
| View a section's attendance                                   | `attendance.read`         | yes                              | yes   | any teacher (they substitute)                                                           | yes   | own children only | no       |
| View the monthly register / export                            | `attendance.report`       | yes                              | yes   | class teacher of that section                                                           | yes   | no                | no       |
| Configure attendance policy (weights, threshold, edit window) | `attendance.policy.write` | yes                              | yes   | no                                                                                      | no    | no                | no       |
| Acknowledge / act on a low-attendance alert                   | `attendance.alert.manage` | yes                              | yes   | class teacher                                                                           | no    | no                | no       |
| Submit scan events (device/wrapper)                           | `attendance.scan.submit`  | service role only (device token) | —     | —                                                                                       | —     | —                 | —        |

Any active teacher may take attendance for any section of their school, so a substitute can cover (owner decision 2026-09-26, D-105); the session and every record name who saved. Admins may take it for any section too. Staff are read-only for reporting. Parents read only through F-AC-10.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table — the exact thing the prototype's `AttendanceLog` lacked.

**`attendance_sessions`** — one per section per date (per period when the school uses period mode): `section_id`, `academic_year_id`, `date date`, `period_no int null` (null = daily roll-call), `timetable_slot_id uuid null`, `section_subject_id uuid null` (period mode), `taken_by uuid references workspace_members`, `taken_at timestamptz`, `status attendance_session_status` (`draft|submitted|locked`), `present_count int`, `absent_count int`, `late_count int`, `excused_count int`, `half_day_count int`, `expected_count int`, `source attendance_source` (`manual|scan_prefill|bulk|import`), `note text null`, `locked_at timestamptz null`, `edited_after_window bool default false`, `bulk_marked_by uuid null references workspace_members` (D-22: set when "Mark all present" was used), `bulk_marked_at timestamptz null`.
Indexes: `unique (section_id, date, coalesce(period_no, 0))`, `index (workspace_id, date)`, `index (workspace_id, section_id, date desc)`.

**`attendance_records`** — one per student per session: `session_id`, `student_id`, `enrollment_id`, `status attendance_status` (`present|absent|late|excused|half_day`), `minutes_late int null`, `note text null`, `recorded_by uuid`, `recorded_at timestamptz`, `source attendance_source`, `updated_by uuid null`, `updated_at`.
Indexes: `unique (session_id, student_id)`, `index (workspace_id, student_id, session_id)`, and a covering index for the percentage query: `index (workspace_id, student_id) include (status)` combined with a join on session date — in practice a materialised helper (§3, `attendance_daily_rollup`) carries the load.

**`attendance_scan_events`** — the **future** input hook (PRODUCT-DECISIONS 2.1, 3.10), built now as a table + endpoint, consumed later by the native wrappers: `student_id null`, `raw_token text`, `scanned_at timestamptz`, `device_id text`, `direction scan_direction` (`in|out`), `room_id null`, `resolved_status text null`, `session_id uuid null` (set when applied), `applied_at timestamptz null`, `error text null`.
Indexes: `index (workspace_id, scanned_at desc)`, `index (workspace_id, student_id, scanned_at desc)`.

**`attendance_edit_requests`** — a teacher asking an admin to reopen a locked session: `session_id`, `requested_by`, `reason text`, `status` (`pending|approved|rejected`), `decided_by`, `decided_at`.

**`attendance_alerts`** — materialised low-attendance flags so they are auditable and acknowledgeable: `student_id`, `kind alert_kind` (`low_attendance_monthly|consecutive_absence|exam_ineligible`), `period_start date`, `period_end date`, `value numeric(5,2)`, `threshold numeric(5,2)`, `status` (`open|acknowledged|resolved`), `acknowledged_by`, `acknowledged_at`, `note`.
Index: `unique (student_id, kind, period_start)`.

**`attendance_daily_rollup`** (materialised view or incrementally-maintained table, refreshed by trigger on `attendance_records`): `workspace_id, student_id, academic_year_id, term_id, month date, present_equiv numeric, expected int, sessions int`. This is what the percentage query, the parent portal, the monthly register and the risk job all read; it keeps the hot path off a row-by-row scan.

**Enums**: `attendance_status`, `attendance_session_status`, `attendance_source`, `scan_direction`, `alert_kind`.

**Policy storage.** All tuning lives in `school_profiles.attendance_policy jsonb` (PRODUCT-DECISIONS 2.2), defaults in §5.1.

**RLS in words.** `attendance_sessions` / `attendance_records`: SELECT for active members with role owner/admin/teacher/staff; a separate **parent** policy on `attendance_records` allowing rows whose `student_id` satisfies `app.is_guardian_of(student_id)`. INSERT/UPDATE for owner/admin and any teacher of the school (D-105; built as the single writer `public.save_attendance`, D-104), **and** requiring `date >= current_date - policy.edit_window_days` for non-admins, **and** `status <> 'locked'`. DELETE: owner/admin only, and only for sessions with no downstream published report (otherwise the UI offers "mark as holiday" instead). `attendance_scan_events` is written only by the service role via the device endpoint and read by owner/admin. `attendance_edit_requests`: a teacher may insert and read their own; owner/admin may read and decide all. `attendance_alerts`: read by owner/admin/teacher (teacher limited to their sections), written by the nightly job (service role) and acknowledged by admins/class teachers. `workspace_id` immutable everywhere.

**Private files.** None. The monthly register PDF lands in `files` with `visibility='workspace'`.

## 4. Workflows

**4.1 Take the roll (the 30-second path).**
_Trigger:_ a class teacher opens the app; the dashboard shows a single card "Class 6 – A · attendance not taken" with a **Take attendance** button. Or `/app/attendance` → today's section list.
_Steps (phone, one-thumb):_

1. The screen opens with **every enrolled student unmarked** (default from `policy.default_status`, see §5.2 — no student is presumed present) and a big header "0 marked · 40 unmarked".
2. The list is 64 px rows: avatar, roll number, name. Tapping anywhere on a row **cycles** unmarked → present → absent → late → unmarked. The current state is shown as a large coloured pill on the **right edge** of the row, inside the thumb arc; an unmarked row shows an empty outline pill, not a "present" pill.
3. A long-press (or the pill's overflow dot) opens a small popover for the less common states — **excused**, **half day**, and **add a note** — so the two-tap common case is never slowed by a five-way picker.
4. A sticky bottom bar shows the running counts and one primary **Save** button, full-width, 56 px tall, in the thumb zone. Secondary actions sit in the top bar, away from the thumb, so they cannot be hit by accident: **Copy yesterday**, and **"Mark all present" (সবাই উপস্থিত)** — the one explicit, audited bulk action that sets every currently-unmarked student to present in one tap, recording `bulk_marked_by` and `bulk_marked_at` on the session. There is no "Mark all absent" shortcut for the same reason there is no default-present: bulk-marking is exceptional, not the default flow.
5. Save requires every enrolled student to have an explicit status; if any remain unmarked, Save is disabled and the bottom bar shows "N unmarked — mark all present or tap each row" rather than silently writing a default.
6. Save writes the session + all records in one server action.
   _Outcome:_ session `submitted`; counts stored; rollup refreshed; the dashboard card flips to "Taken · 38/40".
   _Notifications:_ `attendance.absent` to the primary guardian of each absent student (in-app now; SMS when a provider lands — PRODUCT-DECISIONS 6.7), batched into one send per student; `attendance.not_taken` reminder to the class teacher at a configurable time if no session exists by then.
   _Audit:_ `attendance.session.saved` with counts, and `bulk_marked_by`/`bulk_marked_at` when "Mark all present" was used; `attendance.record.changed` (before/after) for every later edit, never for the first save (which is covered by the session event).
   _Failures:_ no network → the save is queued (§4.6) and the UI shows "Saved offline · will sync"; a session already exists for that date → the screen loads it for editing instead of creating a duplicate (the unique index guarantees this even under a double-tap); the day is a holiday → a banner offers "This is a holiday (Eid). Take attendance anyway?".

**4.2 Admin taking attendance for any section.** `/app/attendance` shows a matrix for today: every section, "taken / not taken", who took it, and the counts. Tapping an untaken section opens the same roll-call screen. A "Remind 4 teachers" button fires `attendance.not_taken` notifications.

**4.3 Edit an existing session.** Within `policy.edit_window_days` (default 2), the section's class teacher can reopen and change records; each change writes `attendance.record.changed`. After the window, the screen is read-only with a "Request correction" button → `attendance_edit_requests` → admin approves → the session unlocks for that teacher for 24 hours, with `edited_after_window = true` stamped on the session so the register footnotes it. Audit `attendance.edit_requested` / `attendance.edit_approved`.

**4.4 Monthly register.** `/app/attendance/register?section=…&month=…` renders the classic grid: students down the left, days across the top, a one-letter code per cell (P / A / L / E / H), then per-student totals and percentage, and a per-day total row. Non-working days are greyed from F-AC-11. "Print" produces a server-rendered A4 landscape PDF with the school header from `school_profiles` and goes to `print_jobs` when requested. CSV export available.

**4.5 Low-attendance alerts.**
_Trigger:_ a nightly job (Vercel cron → `jobs` row → SQL) at 01:00 Asia/Dhaka.
_Steps:_ recompute the month-to-date and term-to-date percentage per student from `attendance_daily_rollup`; open an `attendance_alerts` row where a rule fires (§5.7) and no open alert of that kind exists for the period.
_Outcome:_ alert list on `/app/attendance/alerts` and a dashboard badge; `attendance.low` notification to the class teacher and admins (never directly to the parent without a human — schools want to phone first); the student's profile shows a chip.
_Audit:_ `attendance.alert.opened`, `attendance.alert.acknowledged`.
_Failures:_ the job is idempotent per (student, kind, period_start) by unique index; a re-run changes nothing.

**4.6 Offline queue.**
_Trigger:_ the teacher taps Save with no connectivity (a very common case in BD school buildings).
_Steps:_ the service worker intercepts the action; the payload — including a client-generated **`idempotency_key` (uuid v4, created when the screen opens, not when Save is pressed)** — is written to IndexedDB with a `pending` flag; the UI shows an optimistic "saved" state and a small "1 pending" chip in the top bar. On reconnect (or on the next app open) a background sync drains the queue in order, calling the same server action. The server dedupes on `idempotency_keys`.
_Outcome:_ exactly one session per (section, date, period) regardless of how many replays occur; if the server already has a _newer_ session (someone else saved it meanwhile), the reply is a **conflict payload** and the UI shows a diff sheet: "Ms. Nadia saved this at 09:12. Keep theirs / apply mine / merge per student."
_Audit:_ `attendance.session.saved` with `source='manual'` and a `queued_offline: true` flag in the audit payload.
_Failures:_ a queued item older than 7 days is surfaced as a blocking banner rather than silently dropped; a permanently failing item (e.g. section archived) moves to a "needs attention" list with its error.
_Revocation purge:_ when a teacher's membership `status='removed'` **or** their session is revoked, the **next app open purges the offline queue (IndexedDB), the query cache, and every student-scoped service-worker cache — before anything renders**. This does not depend on a voluntary sign-out: a dismissed teacher does not sign themselves out, so the purge is triggered by revocation detection on load (the session check returning revoked/expired), not only by the sign-out handler. Any pending unsynced records in the purged queue are lost by design — a removed teacher's device must not retain children's names and statuses.

**4.7 Scan events (future hook, built now).**
_Trigger:_ the Android/Windows wrapper scans an ID-card QR (F-AC-02 §4.8) at the gate.
_Steps:_ `POST /api/attendance/scan` with the signed token + device id → the handler verifies the HMAC, resolves the student, writes an `attendance_scan_events` row. A separate **apply** step (manual in v1: "Pre-fill from gate scans" on the roll-call screen) marks scanned students `present` (or `late` if the scan is after `policy.late_after`) and leaves the rest for the teacher, with `source='scan_prefill'`.
_Outcome:_ the teacher still saves the session — scans never silently become attendance. No "live feed", no fake pulse (the prototype's §6.1–2).
_Failures:_ unknown/revoked token → the event is stored with `error` set and shown on an operator screen; duplicate scans within `policy.scan_dedupe_minutes` (default 10) are ignored.

**4.8 Phone specifics.** Roll-call is the one screen designed around the thumb: status pills right-aligned at x ≈ 300–344 px, primary Save at the bottom 88 px, destructive/bulk actions in the top bar only, no horizontal scrolling, no modal that covers the list, and haptic feedback on each tap. At ≥1024 the same screen becomes a three-column grid of the same rows with keyboard shortcuts (`P`/`A`/`L`/`E`/`H`, `↓` to advance, `Enter` to save) for schools with an office PC.

## 5. Business rules and calculations

**5.1 Policy object** — `school_profiles.attendance_policy` (defaults per PRODUCT-DECISIONS 2.2):

```
{
  mode: "daily",                  // "daily" | "period"
  default_status: "unmarked",     // D-22: never "present" — nothing is presumed present
  weights: { present: 1.0, late: 1.0, half_day: 1.0, excused: 0.0, absent: 0.0 },
  excused_in_denominator: true,   // excused counts as a school day the student missed
  late_after: "08:15",            // used only by scan pre-fill
  minutes_late_threshold: 15,
  edit_window_days: 2,
  min_attendance_pct: 75.0,       // exam-eligibility warning, never a block
  low_attendance_alert_pct: 80.0,
  consecutive_absence_alert_days: 3,
  scan_dedupe_minutes: 10,
  notify_guardian_on_absence: true
}
```

Every weight and flag is school-editable; the defaults above are what ships.

**5.2 Default status.** A session opens with every enrolled student at `policy.default_status` (`unmarked`, per D-22 — attendance no longer pre-fills or defaults to present). This is a UI-only state: no `attendance_records` row exists for an unmarked student, and Save is disabled until every student has an explicit status, so an unsaved session is never a present-marking and neither is a saved one that "defaulted" anyone. The only way a student becomes `present` in bulk is the explicit, audited **"Mark all present"** action (§4.1), which stamps `bulk_marked_by`/`bulk_marked_at` on the session; there is no `defaulted_present` field anywhere in the schema.

**5.3 Expected students for a session** = students with an `enrollments` row for that section where `enrolled_on <= session.date` and (`ended_on is null` or `ended_on >= session.date`), and whose `students.status='active'` and `deleted_at is null`. A student transferred on 1 March is expected in the old section up to 28 Feb and the new one from 1 March — nothing else needs to change. The enrolment's current `status` is deliberately not part of the rule (D-105): a transfer changes the status today but must not remove the student from last week's register.

**5.4 Attendance percentage.** For a student over a date range:

```
present_equiv = Σ over records r in range of weights[r.status]
denominator   = count of records in range whose status is counted:
                all statuses except those with weight 0 AND excluded from the denominator
                (by default only nothing is excluded: excused_in_denominator = true,
                 so denominator = count(all records in range))
attendance_pct = round( 100 * present_equiv / denominator , 2 )   // 0 when denominator = 0
```

With the shipped defaults, `present`, `late` and `half_day` each contribute 1.0, `excused` and `absent` contribute 0.0, and all five appear in the denominator. Setting `weights.half_day = 0.5` (a common alternative) immediately changes every screen, the register, the parent portal and the risk score together — because there is exactly **one** implementation, `packages/domain/attendance/percentage.ts`, mirrored by one SQL function `app.attendance_pct(student_id, from, to)`. A parity test asserts the TS and SQL implementations agree on a fixture matrix. (The prototype had three disagreeing formulas — §5 of the inventory.)

**5.5 Section attendance rate for a day** = `round(100 * Σ weights[status] / expected_count, 2)`. A day with **no session** is `null`, not 0 — so a holiday or an untaken day plots as a **gap**, never as a 0 % dip (the prototype's `StudentAnalytics.jsx:73-78` bug).

**5.6 Working days and expected sessions.** A date counts as a school day when it is in `school_profiles.working_days` **and** F-AC-11 does not mark it a holiday **and** no `working_day_override` says otherwise. "Sessions missing" on the admin matrix = school days in range minus sessions present. Attendance percentages are computed from **records**, not from calendar days, so an untaken day never penalises a student.

**5.7 Alert rules.**

- `low_attendance_monthly`: month-to-date `attendance_pct < policy.low_attendance_alert_pct` (default 80) **and** at least 10 records in the month.
- `consecutive_absence`: `policy.consecutive_absence_alert_days` (default 3) consecutive school-day records with status `absent` (`excused` breaks the streak, `late`/`half_day` break it).
- `exam_ineligible`: term-to-date `attendance_pct < policy.min_attendance_pct` (default 75) evaluated when an exam is published for that term — surfaced as a **warning** on the exam roster and the admit card, never a block (PRODUCT-DECISIONS 2.2).
  Each rule opens at most one alert per (student, kind, period_start).

**5.8 Consecutive-absence streak** is computed over _school days with a session_, ordered by date, ignoring days with no session.

**5.9 Edit window.** `now() at time zone tz - session.date <= policy.edit_window_days` for teachers; admins are unbounded but every out-of-window change stamps `edited_after_window = true` and the monthly register prints a footnote "n sessions edited after the correction window".

**5.10 Half day** contributes `weights.half_day` to `present_equiv` and 1 to the denominator. It is a distinct status, never stored as 0.5 of a record.

**5.11 Idempotency of saves.** The session save key is `sha256(workspace_id|section_id|date|period_no|client_session_uuid)`. Replays return the stored result. Concurrent saves from two devices are resolved by the unique index plus the conflict payload in §4.6.

**5.12 Counts on the session row** are derived, written in the same statement as the records, and re-derived by a trigger if any record changes — they are a cache for list screens; the register recomputes.

**5.13 Rollup maintenance.** `attendance_daily_rollup` is updated by an `after insert/update/delete` statement-level trigger on `attendance_records` that upserts the affected (student, month) aggregates. A nightly reconciliation job recomputes the current month from scratch and logs any drift (there should be none).

**5.14 Timezone.** "Today" is `(now() at time zone school_profiles.timezone)::date`, computed in SQL. No client ever sends "today" for authorisation purposes (the prototype's UTC-today bug, inventory §8).

## 6. UI

| Screen                 | Route                                 | 360×800                                                                                    | ≥1024                                                      | Primary action     | Empty                         | Loading                    | Error                                                        |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------ | ----------------------------- | -------------------------- | ------------------------------------------------------------ |
| Today (teacher)        | `/app/attendance`                     | One card per section the teacher owns: "Class 6 – A · not taken", big Take button          | Grid of section cards + a school-wide "taken" progress bar | Take attendance    | "No sections assigned to you" | 3 skeleton cards           | Retry banner                                                 |
| Today (admin matrix)   | `/app/attendance`                     | Scrollable list of all sections with taken/not-taken chips and counts                      | Table: section, taken by, time, P/A/L/E/H, rate            | Remind untaken     | "No sections yet" → F-AC-01   | Skeleton rows              | Retry                                                        |
| Roll call              | `/app/attendance/[sectionId]?date=…`  | 64 px rows, right-edge status pill, sticky bottom Save + live counts, top-bar bulk actions | 3-column grid, keyboard shortcuts, right summary panel     | Save               | "No students enrolled"        | Roster skeleton with pills | Save failure → keeps local state, shows Retry / Save offline |
| Session history        | `/app/attendance/[sectionId]/history` | Day list with counts, tap to open read-only or editable                                    | Calendar heat-grid                                         | Open a day         | "No sessions yet"             | Skeleton                   | Retry                                                        |
| Monthly register       | `/app/attendance/register`            | Horizontally scrollable grid with a frozen name column; per-student total chip             | Full grid, no scroll at 1280                               | Print / Export CSV | "No sessions this month"      | Grid skeleton              | Retry                                                        |
| Student attendance tab | `/app/students/[id]?tab=attendance`   | Month strip + list of non-present days with notes; big % ring                              | Month grid + trend chart                                   | Add note (admin)   | "No records yet"              | Skeleton                   | Retry                                                        |
| Alerts                 | `/app/attendance/alerts`              | Card list: student, %, period, Acknowledge button                                          | Table with bulk acknowledge                                | Acknowledge        | "No alerts — nice"            | Skeleton                   | Retry                                                        |
| Policy settings        | `/app/settings/academics/attendance`  | Grouped form with plain-language previews ("late counts as present")                       | Two-column                                                 | Save               | n/a                           | Skeleton                   | Field errors                                                 |
| Offline queue          | sheet from the top-bar chip           | List of pending saves with section + date, Retry all                                       | Same                                                       | Retry all          | "Nothing pending"             | —                          | Per-item error text                                          |

`packages/ui`: `RollCallList` (new, virtualised, 64 px rows, thumb-zone pills, haptics), `StickyActionBar`, `CountPills`, `DayStrip`, `RegisterGrid` (frozen first column), `PercentRing`, `AlertCard`, `ConflictSheet`, `PendingChip`, `FilterChips`, `EmptyState`.

## 7. Server contracts

| Action / handler                              | Input schema (Zod)                                                                                                                                        | Output                                                                                                          | Errors                                                                                                                        | Idempotency                          | Rate limit    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------- |
| `getRollCall` (server component loader)       | `RollCallQuery` {sectionId, date, periodNo?}                                                                                                              | `RollCallView` {session?, students[], policy, isHoliday, editable}                                              | `SECTION_NOT_FOUND`, `NOT_ASSIGNED`                                                                                           | —                                    | —             |
| `saveAttendanceSession`                       | `SaveAttendanceInput` {sectionId, date, periodNo?, sectionSubjectId?, clientSessionId (uuid), records: [{studentId, status, minutesLate?, note?}], note?} | `AttendanceSession` (canonical, with records)                                                                   | `SESSION_LOCKED`, `OUTSIDE_EDIT_WINDOW`, `YEAR_CLOSED`, `STUDENT_NOT_ENROLLED`, `CONFLICT` (with the server session attached) | **key required** (`clientSessionId`) | 600/h/user    |
| `updateAttendanceRecord`                      | `UpdateAttendanceRecordInput` {recordId, status, minutesLate?, note?}                                                                                     | `AttendanceRecord`                                                                                              | `OUTSIDE_EDIT_WINDOW`, `SESSION_LOCKED`                                                                                       | —                                    | 1200/h        |
| `markAllPresent`                              | `MarkAllPresentInput` {sectionId, date, periodNo?}                                                                                                        | `AttendanceSession` (all currently-unmarked students set to present, `bulk_marked_by`/`bulk_marked_at` stamped) | `SESSION_LOCKED`, `OUTSIDE_EDIT_WINDOW`                                                                                       | same as save                         | key required  | 120/h |
| `copyPreviousSession`                         | `CopyPreviousInput` {sectionId, date}                                                                                                                     | `RollCallView` (prefilled, unsaved)                                                                             | `NO_PREVIOUS_SESSION`                                                                                                         | —                                    | 120/h         |
| `lockAttendanceSession`                       | `LockSessionInput` {sessionId}                                                                                                                            | `AttendanceSession`                                                                                             | `ALREADY_LOCKED`                                                                                                              | —                                    | 60/h          |
| `requestAttendanceEdit`                       | `RequestEditInput` {sessionId, reason}                                                                                                                    | `AttendanceEditRequest`                                                                                         | `ALREADY_PENDING`                                                                                                             | —                                    | 30/h          |
| `decideAttendanceEdit`                        | `DecideEditInput` {requestId, decision, note?}                                                                                                            | `AttendanceEditRequest`                                                                                         | `ALREADY_DECIDED`                                                                                                             | —                                    | 60/h          |
| `GET /api/attendance/register`                | `RegisterQuery` {sectionId, month, format: 'json'                                                                                                         | 'csv'}                                                                                                          | register matrix or CSV                                                                                                        | `SECTION_NOT_FOUND`                  | —             | 120/h |
| `POST /api/pdf/attendance-register`           | `RegisterPdfInput` {sectionId, month, queuePrint?}                                                                                                        | `{fileId, printJobId?}`                                                                                         | —                                                                                                                             | key required                         | 30/h          |
| `acknowledgeAttendanceAlert`                  | `AckAlertInput` {alertId, note?}                                                                                                                          | `AttendanceAlert`                                                                                               | `ALREADY_ACKNOWLEDGED`                                                                                                        | —                                    | 300/h         |
| `updateAttendancePolicy`                      | `AttendancePolicyInput` (the §5.1 object)                                                                                                                 | `SchoolProfile`                                                                                                 | `INVALID_WEIGHTS` (must be 0..1)                                                                                              | —                                    | 60/h          |
| `POST /api/attendance/scan`                   | `ScanEventInput` {token, deviceId, direction, scannedAt}                                                                                                  | `{eventId, studentId?}`                                                                                         | `INVALID_SIGNATURE`, `EXPIRED`, `REVOKED`, `DUPLICATE_IGNORED`                                                                | dedupe by (student, minute)          | 3600/h/device |
| `prefillFromScans`                            | `PrefillFromScansInput` {sectionId, date}                                                                                                                 | `RollCallView` (prefilled, unsaved, `source='scan_prefill'`)                                                    | `NO_SCANS`                                                                                                                    | —                                    | 120/h         |
| `runAttendanceAlertsJob` (cron, service role) | `{workspaceId?}`                                                                                                                                          | `{opened: number}`                                                                                              | —                                                                                                                             | idempotent by unique index           | 1/night       |

The offline queue calls **`saveAttendanceSession` unchanged** — there is no separate sync endpoint, which is what makes the idempotency contract the only thing that has to be right.

## 8. Parts (build chunks)

**Part 1 — Tables, policy and the percentage function** · `attendance_sessions`, `attendance_records`, enums, RLS (including the parent policy), `school_profiles.attendance_policy` with defaults, `app.attendance_pct()` in SQL and `percentage.ts` in domain plus the parity test, policy settings screen · tests: pgTAP isolation/escalation, TS↔SQL parity matrix over all five statuses and weight variants · **Demo:** change `half_day` weight to 0.5 in settings and watch one fixture student's percentage change identically in SQL and TS.

**Part 2 — Roll-call screen and save** · `RollCallList` primitive, tap-to-cycle, long-press popover for excused/half-day/note, sticky bottom bar, `saveAttendanceSession` with idempotency and the unique index, session counts trigger · tests: e2e at 360×800 marking 40 students in under 30 s (measured), integration for double-save · **Demo:** a class teacher takes attendance for 40 students one-handed and saves once.

**Part 3 — Today views, bulk actions and reminders** · teacher "today" cards, admin matrix with taken/not-taken, the audited `markAllPresent` bulk action (`bulk_marked_by`/`bulk_marked_at`, no "mark all absent" equivalent), copy-yesterday, `attendance.not_taken` reminder job, `attendance.absent` guardian notification · tests: reminder job idempotency, notification fan-out limited to one per student per day · **Demo:** admin sees 4 untaken sections at 10:00 and sends reminders; guardians of absentees have one notification each.

**Part 4 — Edit window, locking and correction requests** · window enforcement in RLS + domain, read-only state, `attendance_edit_requests`, admin approval, `edited_after_window` stamping · tests: pgTAP proving a teacher cannot update a 5-day-old record while an admin can · **Demo:** a teacher tries to fix last week, requests a correction, the admin approves, the teacher fixes it, and the register footnotes it.

**Part 5 — Monthly register and exports** · `attendance_daily_rollup` with its trigger and nightly reconciliation, `RegisterGrid` with a frozen name column, CSV export, React-PDF A4 landscape register with the school header and Bengali font, print-queue hand-off · tests: register correctness fixture (transfers mid-month, holidays, half-days), PDF snapshot · **Demo:** print Class 6 – A's March register; the totals match the per-student percentages on the profile exactly.

**Part 6 — Alerts** · `attendance_alerts`, the three rules, nightly cron job, alerts screen with acknowledge, dashboard badge, profile chip, `attendance.low` notification, exam-eligibility warning surface for F-AC-06 · tests: rule unit tests incl. streak-breaking by excused; job idempotency · **Demo:** a student below 80 % appears on the alerts screen overnight; the class teacher acknowledges with a note.

**Part 7 — Offline queue and scan hook** · service-worker queue in IndexedDB with client-generated idempotency keys, pending chip and queue sheet, conflict diff sheet, background sync, `attendance_scan_events` + `POST /api/attendance/scan` with HMAC verification, "Pre-fill from gate scans" · tests: Playwright offline-mode journey (go offline, mark, save, reconnect, assert exactly one session), replay-attack test on the scan endpoint · **Demo:** turn off the network, take attendance for two sections, turn it back on, and watch both sync with no duplicates.

## 9. Acceptance criteria

1. **Given** a class teacher on a 360×800 phone with 40 students, **when** they open the roll-call screen, **then** all 40 are **unmarked** (D-22 — none pre-marked present), the Save button is within the bottom 88 px, every status pill is right-aligned within the thumb arc, and no horizontal scrolling exists.
2. **Given** that screen, **when** the teacher taps **"Mark all present"** and then taps 4 rows to absent and Save, **then** exactly one `attendance_sessions` row and 40 `attendance_records` rows exist, with 36 present and 4 absent, the session's `bulk_marked_by`/`bulk_marked_at` are stamped, and the whole interaction is completable in under 30 seconds (measured in the e2e journey); **given** the teacher instead taps each of the 40 rows individually with no bulk action, **then** the same 40 records result with `bulk_marked_by is null`.
3. **Given** a saved session, **when** Save is pressed twice (double-tap or replay), **then** exactly one session exists and the second call returns the stored result from `idempotency_keys`.
4. **Given** two teachers saving the same section/date from two devices, **when** the second save arrives, **then** it returns `CONFLICT` with the server's session attached and the UI offers keep-theirs / apply-mine / merge — no silent overwrite.
5. **Given** the default policy, **when** a student has 18 present, 1 late, 1 half-day and 2 absent in a month, **then** their percentage is `round(100 × (18+1+1) / 22, 2) = 90.91` on the teacher screen, the register, the parent portal and the risk job — all four reading one implementation.
6. **Given** `weights.half_day` is changed to 0.5, **when** the same month is recomputed, **then** every surface shows `round(100 × 19.5 / 22, 2) = 88.64` and the SQL↔TS parity test still passes.
7. **Given** a holiday declared in F-AC-11, **when** the daily-rate chart renders, **then** that day is a gap, not a 0 % point, and the roll-call screen warns before allowing a session.
8. **Given** a student transferred from 6 – A to 6 – B on 1 March, **when** the March register for each section is printed, **then** 6 – A shows them for 1–28 Feb only and 6 – B from 1 March, and their overall percentage counts every record exactly once.
9. **Given** `edit_window_days = 2`, **when** a teacher tries to change a record from 5 days ago, **then** both the server action and RLS refuse it, and the screen offers "Request correction"; **when** an admin approves, **then** the teacher can edit for 24 hours and the session is stamped `edited_after_window`.
10. **Given** no network, **when** a teacher marks and saves two sections, **then** the UI confirms "Saved offline · 2 pending", and on reconnect exactly two sessions are created with no duplicates and the pending chip clears.
11. **Given** a queued offline save for a section that was archived meanwhile, **when** sync runs, **then** the item moves to a visible "needs attention" list with the server's error — it is never dropped silently.
12. **Given** a student at 78 % month-to-date with 14 records and a threshold of 80, **when** the nightly job runs, **then** one `low_attendance_monthly` alert opens, the class teacher gets `attendance.low`, and re-running the job the same night creates nothing new.
13. **Given** a student at 71 % term-to-date and a published exam, **when** the exam roster is viewed, **then** an "below 75 % attendance" warning shows and the student is still allowed to sit the exam.
14. **Given** an ID-card QR scanned at the gate, **when** it is posted to `/api/attendance/scan`, **then** a scan event is stored; **when** the teacher taps "Pre-fill from gate scans", **then** scanned students are pre-marked present (late if after `late_after`) and the session is still only created when the teacher taps Save.
15. **Given** a parent, **when** they query attendance records, **then** RLS returns only their own children's rows — asserted by a pgTAP negative test against a classmate's `student_id`.
16. **Given** a teacher not attached to Class 9 – B, **when** they call `saveAttendanceSession` for it directly, **then** both the permission check and RLS refuse it.

## 10. Tests

- **Unit (`packages/domain`)**: `attendancePercentage` across the full status × weight matrix, `isCountedInDenominator`, `dailyRate` (null vs 0 for empty days), `consecutiveAbsenceStreak` (excused breaks, weekends skipped, transfers), `expectedStudentsFor(date)`, `editWindowOpen(date, policy, tz)` across Asia/Dhaka midnight and DST-free boundaries, `alertRules`, `sessionCounts`.
- **DB (pgTAP)**: isolation and escalation on all five tables; the parent policy positive/negative; the teacher-assignment policy (class teacher vs subject teacher vs unrelated teacher); the edit-window predicate inside the policy; the `(section_id, date, period_no)` unique index under concurrent inserts; the rollup trigger's correctness after insert/update/delete; `workspace_id` immutability; scan events unreadable by teachers.
- **Parity test**: `app.attendance_pct()` vs `percentage.ts` over a generated fixture of 500 students × 3 policies — CI fails on any disagreement.
- **Integration**: `saveAttendanceSession` happy path, replay, conflict, locked, outside-window, unenrolled student, year closed; register JSON vs CSV vs PDF agreement on the same data; the alerts job idempotency.
- **E2E (360×800 and 1280×800, axe)**: `take-attendance-one-thumb` (with a timing assertion and a tap-coordinate assertion that every pill centre is ≥ x 280 px), `edit-request-approve`, `monthly-register-print`, `offline-queue-sync` (Playwright `context.setOffline`), `parent-sees-own-child-only`. Axe clean on roll-call, register and alerts.
- **Performance budgets**: roll-call screen interactive < 1.5 s on a mid-range Android over 3G with a 60-student section; `saveAttendanceSession` p95 < 400 ms for 60 records (single multi-row insert, not N+1 — the prototype looped one request per student); register for 60 students × 26 days < 600 ms; the nightly alert job < 60 s for 5,000 students.

## 11. Open questions

1. **Period-level attendance.** `mode: "period"` and `period_no` are modelled now but the v1 UI ships daily only. Assumed: secondary schools that want per-period attendance flip the setting and get the same screen per timetable slot; if demand is strong this becomes its own part rather than a setting.
2. **Guardian absence notification channel.** In-app only in v1 (no SMS provider — PRODUCT-DECISIONS 6.7). Assumed: schools will also phone; the contact log in the messaging module records that. When an SMS provider lands, `attendance.absent` gains a channel with no schema change.
3. **Should `excused` be excluded from the denominator?** Default `excused_in_denominator = true` (it lowers the percentage, matching most BD schools' "attendance is attendance" view). Flagged for the owner — flipping it is one setting and one fixture update.
4. **Late-minutes capture.** `minutes_late` exists but the phone UI does not ask for it (it would cost a tap). Assumed: captured only from scan events and from the desktop screen; revisit if schools want it on the register.
5. **Retroactive holiday declaration.** If a day is declared a holiday _after_ attendance was taken, the sessions remain. Assumed: the register footnotes them and the percentages keep them; an explicit "void sessions for this day" admin action is available and audited.
6. **Exam-hall attendance** (who actually sat an exam) is modelled in F-AC-06 as `marks.status = 'absent'`, not here. Assumed correct; a school wanting both will see one derived from the other.

### Status / deviations recorded 2026-09-25 (demo cut, D-104)

- **Built:** `attendance_sessions`, `attendance_records`, `public.save_attendance`, `public.attendance_day`, `app.attendance_pct` (migration `20260925300309_attendance.sql`, pgTAP `34_attendance.sql`); `/app/attendance` (Today: your class first, then every class marked / not marked with who and when, the school's rate so far) and `/app/attendance/[sectionId]` (roll call: everyone unmarked, "Mark all present" with Undo, one tap per exception on the segmented toggle, sticky Save with live counts, non-school-day confirmation, read-only for other roles or outside the window); the dashboard's attendance slot. English and Bangla with Western digits.
- **Deviations:** the percentage uses DATA-MODEL's policy booleans (`late_counts_present`, `half_day_counts_present`) rather than §5.1's weight map, so AC6's 0.5 half-day weight needs a policy change first; the edit window is read from `attendance_policy.edit_window_days` (default 2) with no Settings field yet; a concurrent save returns `CONFLICT` ("reload") instead of the keep/apply/merge sheet; the roll call uses DESIGN-SYSTEM §4.4's segmented toggle instead of tap-to-cycle; no `note`, `source`, `period_no` or `locked_at` columns yet.
- **Not built yet:** policy screen (Part 1), copy-yesterday, reminders and the absent-guardian notification (Part 3), locking and correction requests (Part 4), register and rollup (Part 5), alerts (Part 6), the offline queue and scan hook (Part 7), the parent policy (F-AC-10).
- **Journey:** `apps/web/e2e/journeys/take-attendance.spec.ts` (skip-gated on OQ-27; asserts the 30-second budget).

### Status / deviations recorded 2026-09-26 (follow-ups, D-105)

- **Any teacher marks any section** (§2): `public.save_attendance` accepts any active owner/admin/teacher of the school; `NOT_ASSIGNED` and `app.can_mark_attendance` are gone (migration `20260925300311_attendance_any_teacher.sql`, pgTAP `35_attendance_any_teacher.sql`). Staff, parents, non-members and other schools' teachers are still `FORBIDDEN`; the edit window, future date, school day, class list, idempotency, `CONFLICT` and read-only guards are unchanged. Today offers "Take attendance" on every class to anyone who may mark; the roll call is editable for them.
- **§5.3 by date:** the expected class list (and Today's enrolled count, now also scoped by `workspace_id`) is `enrolled_on`/`ended_on` on the date plus the student's own status — not the enrolment's current status.
- **Roll call:** a successful save clears the "Mark all present" flag so the next save of the same screen does not re-stamp it; student, class and teacher names render through `BnEnText`.
- Half day stays on/off (no 0.5 weight, D-104 point 3).
