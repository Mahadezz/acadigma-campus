# F-AC-04 — Staff attendance and leave

|                  |                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                                             |
| Status           | planned                                                                                                                                                               |
| Owner branch     | `feat/academics-staff-attendance`                                                                                                                                     |
| Depends on       | F-AU-02 (memberships), F-AC-01 (sections/section_subjects), F-AC-11 (calendar/working days), F-AC-05 (timetable — for the cover engine hand-off)                      |
| Plan             | `docs/plan/ROADMAP.md` chunk 4                                                                                                                                        |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (TeacherAttendance), §3 features 22–27, §5 (teacher attendance rate), §6 items 17, 46, 51, 53, 55, 57, §7 Q9 |

## 1. Purpose

The school office needs to know, by 9 a.m., who is in the building — because a missing teacher means an uncovered period. This feature gives every member a one-tap **self check-in**, gives admins a daily grid to mark everyone else, handles **leave requests and approvals**, and produces the **monthly staff attendance summary** the office prints for payroll. Its second job is to be the trigger source for the cover-teacher engine (PRODUCT-DECISIONS 6.3): the moment a teacher is marked absent or approved for leave, every timetable slot they own that day becomes a cover request. "Done": a teacher taps one button on arrival, an admin sees a live 24-row grid, an absent teacher's five periods appear in the cover queue before first period ends, and the month's summary exports without anyone retyping it.

**Base44 intent vs reality.** `TeacherAttendance` had **no `workspace_id` and no RLS** — every school on the platform shared one staff attendance table. The staff roster came from `base44.entities.User.list()`, i.e. _all platform users_, not this school's members. Three sources of truth disagreed about who could even open the screen (route allowed teachers, nav hid it from teachers, the permission matrix said admin-only). "Mark All Present" fired one request per staff member against a stale snapshot, so a double-click produced duplicate rows for the same teacher and date. The role filter used `<SelectItem value={null}>`, which Radix rejects outright. An export icon was imported but no export button existed. Leave existed only as a `leave_type` string on an attendance row — there was no request, no approval, no balance and no notification. PRODUCT-DECISIONS 2.9 settles the permission question: **admins/owners mark others; every member can self check-in; teachers cannot edit others.**

## 2. Roles and permissions

| Action                                                                 | Permission key                  | owner | admin | teacher | staff | parent | platform |
| ---------------------------------------------------------------------- | ------------------------------- | ----- | ----- | ------- | ----- | ------ | -------- |
| Self check-in / check-out                                              | `staff_attendance.self`         | yes   | yes   | yes     | yes   | no     | no       |
| View own attendance history                                            | `staff_attendance.read_own`     | yes   | yes   | yes     | yes   | no     | no       |
| View the whole staff grid / summary                                    | `staff_attendance.read_all`     | yes   | yes   | no      | no    | no     | no       |
| Mark another member present/absent/late/leave                          | `staff_attendance.write_all`    | yes   | yes   | no      | no    | no     | no       |
| Edit a past staff attendance record                                    | `staff_attendance.write_past`   | yes   | yes   | no      | no    | no     | no       |
| Configure staff attendance settings (check-in window, grace, geofence) | `staff_attendance.policy.write` | yes   | yes   | no      | no    | no     | no       |
| Request leave                                                          | `leave.request`                 | yes   | yes   | yes     | yes   | no     | no       |
| View own leave requests and balance                                    | `leave.read_own`                | yes   | yes   | yes     | yes   | no     | no       |
| View all leave requests                                                | `leave.read_all`                | yes   | yes   | no      | no    | no     | no       |
| Approve / reject leave                                                 | `leave.decide`                  | yes   | yes   | no      | no    | no     | no       |
| Configure leave types and entitlements                                 | `leave.policy.write`            | yes   | yes   | no      | no    | no     | no       |
| Export monthly summary (payroll)                                       | `staff_attendance.export`       | yes   | yes   | no      | no    | no     | no       |
| See hourly rates / payroll amounts                                     | `staff.rate.read`               | yes   | yes   | no      | no    | no     | no       |

Owners and admins are the only readers of the whole grid, matching PRODUCT-DECISIONS 2.9 and ending the prototype's three-way disagreement. Every member sees their own row and their own leave balance.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table — precisely what the prototype's table lacked.

**`staff_attendance`** — one row per member per date: `member_id uuid references workspace_members`, `date date`, `status staff_attendance_status` (`present|absent|late|half_day|on_leave|holiday|weekend|official_duty`), **`half day_half null`** (`first|second`, **not null exactly when `status in ('half_day','on_leave')` and the absence covers only part of the day** — the cover-teacher engine scopes its trigger by it, so "morning only" produces cover requests for the morning periods and leaves the afternoon alone), `check_in_at timestamptz null`, `check_out_at timestamptz null`, `minutes_late int null`, `worked_minutes int null`, `leave_request_id uuid null references leave_requests`, `leave_type_id uuid null`, `source staff_attendance_source` (`self|admin|leave|auto|import`), `note text null`, `marked_by uuid null`, `check_in_lat numeric null`, `check_in_lng numeric null`, `check_in_device text null`.
Indexes: `unique (member_id, date)` — this alone kills the prototype's duplicate-row bug; `index (workspace_id, date)`, `index (workspace_id, member_id, date desc)`. Check: `half is null or status in ('half_day','on_leave')`.

**Enum `day_half`** (`first|second`) is shared with `leave_requests.half_day_start_half` / `half_day_end_half` below, so "half day" always means a _named_ half everywhere in the product.

**`leave_types`** — per school: `name text` ("Casual", "Sick", "Earned", "Maternity", "Unpaid", "Official Duty"), `code text`, `annual_entitlement_days numeric(5,1) null` (null = unlimited/unlimited-with-approval), `is_paid bool default true`, `requires_document bool default false`, `carry_forward bool default false`, `max_consecutive_days int null`, `colour text`, `sort int`, `is_active bool`.
Index: `unique (workspace_id, code)`. Seeded with a BD default set (§5.2).

**`leave_requests`** — `member_id`, `leave_type_id`, `starts_on date`, `ends_on date`, `half_day_start bool`, **`half_day_start_half day_half null`** (which half of the first day is taken — defaults `second`, i.e. the member works the morning and leaves at lunch), `half_day_end bool`, **`half_day_end_half day_half null`** (defaults `first`, i.e. the member is away in the morning and returns after lunch), `days numeric(5,1)` (computed, §5.4), `reason text`, `status leave_status` (`draft|pending|approved|rejected|cancelled|withdrawn`), `document_file_id uuid null`, `decided_by uuid null`, `decided_at timestamptz null`, `decision_note text null`, `cover_arranged bool default false`, `academic_year_id`.
Indexes: `index (workspace_id, member_id, starts_on desc)`, `index (workspace_id, status)`, exclusion constraint preventing two **approved** requests from overlapping for the same member.

**`leave_balances`** — materialised per member per year per type: `member_id`, `academic_year_id`, `leave_type_id`, `entitled numeric(5,1)`, `taken numeric(5,1)`, `pending numeric(5,1)`, `carried_forward numeric(5,1)`, `remaining numeric(5,1) generated`.
Index: `unique (member_id, academic_year_id, leave_type_id)`.

**`staff_attendance_policy`** — kept as a jsonb column on `school_profiles` alongside the student policy: see §5.1.

**Enums**: `staff_attendance_status`, `staff_attendance_source`, `leave_status`.

**RLS in words.** `staff_attendance`: SELECT for owner/admin over the whole workspace; every other active member may select **only rows where `member_id` is their own membership** (`member_id in (select id from workspace_members where user_id = auth.uid() and workspace_id = t.workspace_id)`). INSERT/UPDATE by owner/admin for anyone; a self policy allows a member to insert/update only their own row, only for **today** in the school timezone, and only the check-in/check-out columns (status is derived server-side). DELETE: owner/admin only. `leave_requests`: a member may insert and select their own and may update their own only while `status in ('draft','pending')` (to withdraw or edit); owner/admin may select and update all, and only they may move a request to `approved|rejected`. `leave_types` and `leave_balances`: read by all active members (people need to see their entitlement), written by owner/admin (balances by the service role job). Hourly rates live on `staff_records` (F-OP area) with an admin-only policy and are never joined into a payload a teacher can read. `workspace_id` immutable everywhere; platform admin read-only bypass.

**Private files.** `leave_requests.document_file_id` (medical certificates) is a `files` row with `visibility='private'`, readable only by the requester and owner/admin through `GET /api/files/[id]`, with `file_access_log` written. Geolocation columns are treated as sensitive: never returned to non-admins, never logged.

## 4. Workflows

**4.1 Self check-in.**
_Trigger:_ any member opens the app between `policy.check_in_opens` and `policy.check_in_closes`; the dashboard shows a single wide **Check in** button with the current time.
_Steps:_ one tap → optional geolocation capture (only if `policy.geofence.enabled`, with an explicit browser permission prompt and a clear "why") → the server records `check_in_at = now()` and derives the status (§5.3). The button becomes **Check out** for the rest of the day.
_Outcome:_ a `staff_attendance` row for today with `source='self'`.
_Notifications:_ none on success (nobody wants a notification for arriving). `staff.missed_punch` fires to admins per PRODUCT-DECISIONS 6.3(b) at first period + grace when a member with periods today has not checked in.
_Audit:_ `staff_attendance.checked_in`.
_Failures:_ outside the window → the button is disabled with "Check-in opens at 07:00"; outside the geofence → the check-in is still recorded but flagged `outside_geofence` for the admin (never blocked — a teacher standing at the gate with bad GPS must not be locked out); already checked in → idempotent, returns the existing row.

**4.2 Admin marks the grid.**
_Trigger:_ admin opens `/app/staff/attendance`.
_Steps:_ a list of every **active member** of this workspace (from `workspace_members`, never a platform-wide user list), each row showing name, role label, self check-in time if any, and a status control. Tapping a row cycles present → absent → late; a long-press opens the fuller set (half day, on leave, official duty, add note). **Mark all present** is in the top bar and writes one batched upsert, not N requests (the prototype's §6.51 bug).
_Outcome:_ one upsert per member per date; existing self check-ins are preserved and shown, with the admin's value winning on conflict and `marked_by` recorded.
_Notifications:_ `staff.marked_absent` to the member (so they can dispute), and — the important one — marking a teacher `absent`, `half_day` or `on_leave` **emits `cover.trigger`** carrying `{member_id, date, half}` for the cover-teacher engine (PRODUCT-DECISIONS 6.3(a)). Choosing `half_day` opens a required "Which half?" segmented control in the same long-press sheet.
_Audit:_ `staff_attendance.marked` with before/after.
_Failures:_ double-tap on Mark-all → idempotency key makes it a no-op; a removed member cannot be marked (`MEMBER_NOT_ACTIVE`).

**4.3 Request leave.**
_Trigger:_ member taps "Apply for leave" on their profile or the dashboard.
_Steps:_ sheet with leave type (showing remaining balance inline: "Casual · 6.5 of 10 left"), date range with half-day toggles on the first and last day, reason, optional document upload when the type requires it. Submit.
_Outcome:_ `leave_requests` row `pending`; `leave_balances.pending` increases by the computed days.
_Notifications:_ `leave.requested` to owners/admins with an Approve/Reject action in the notification; the requester sees a "pending" chip.
_Audit:_ `leave.requested`.
_Failures:_ overlapping an existing approved request → `LEAVE_OVERLAP` with the conflicting dates shown; exceeding `max_consecutive_days` → validation error; insufficient balance → **warning, not a block** (an admin can approve unpaid overage; the request records `over_balance_days`).

**4.4 Approve or reject leave.**
_Trigger:_ admin opens `/app/staff/leave` or the notification.
_Steps:_ request card shows the member's timetable impact — "affects 7 periods across 3 days" — computed from F-AC-05, plus current balance. Approve (with optional note) or Reject (note required).
_Outcome on approve:_ the request becomes `approved`; `staff_attendance` rows are **auto-created** for every school day in the range with `status='on_leave'` and `source='leave'`; the first and last day carry `half = half_day_start_half` / `half_day_end_half` when those flags are set, and every full day in between carries `half = null`; balances move from `pending` to `taken`; one `cover.trigger` is emitted per affected date **carrying that date's `half`**, so a half-day start produces a half-day cover request and the full days produce whole-day ones.
_Outcome on reject:_ status `rejected`, pending balance released.
_Notifications:_ `leave.decided` to the requester; `cover.trigger` to the cover engine; `staff.on_leave` digest to admins each morning.
_Audit:_ `leave.approved` / `leave.rejected` with the note.
_Failures:_ approving a request that now overlaps another approved one → `LEAVE_OVERLAP` (the exclusion constraint is the backstop); approving into a closed academic year → `YEAR_CLOSED`.

**4.5 Cancel / withdraw leave.** The requester may withdraw while `pending`; after approval, only an admin may cancel, which deletes the auto-created `on_leave` attendance rows for **future** dates only (past ones are history), releases the balance, and emits `cover.cancelled`. Audit `leave.cancelled`.

**4.6 Monthly summary and export.**
_Trigger:_ `/app/staff/attendance/summary?month=…`.
_Steps:_ per member: present days, late days, half days, leave days by type, absent days, attendance rate, total worked minutes, late minutes. A heat strip per member across the month. Export CSV or a React-PDF **Staff attendance summary** (one of the six v1 report types, PRODUCT-DECISIONS 6.6) with the school header.
_Outcome:_ the payroll-ready sheet the prototype imported an icon for but never built.
_Audit:_ `staff_attendance.exported` (it contains personal data).

**4.7 Missed-punch job.** At `policy.first_period_start + policy.missed_punch_grace_minutes` on each school day, a job lists active members who have a timetable slot today and no `staff_attendance` row; it notifies admins (`staff.missed_punch`) with a one-tap "mark absent" action. It never marks anyone automatically — PRODUCT-DECISIONS 6.3(b) makes the _trigger_ automatic, the _decision_ human.

**4.8 Phone specifics.** The check-in button is a full-width 64 px control in the bottom third of the dashboard. The admin grid is a vertical list (never a horizontal table on a phone) with the status control right-aligned in the thumb arc, identical in feel to student roll-call (F-AC-03) so the muscle memory transfers. Leave application is a bottom sheet; the approve/reject action is available directly in the notification card.

## 5. Business rules and calculations

**5.1 Policy object** — `school_profiles.staff_attendance_policy`:

```
{
  check_in_opens: "06:30",
  check_in_closes: "11:00",
  on_time_until: "08:00",          // after this → late
  half_day_before_minutes: 240,    // worked < 4h and checked out → half day
  full_day_minutes: 360,
  missed_punch_grace_minutes: 30,
  first_period_start: "08:00",     // default; overridden by the bell schedule (F-AC-05)
  geofence: { enabled: false, lat: null, lng: null, radius_m: 200 },
  self_checkin_enabled: true,
  count_half_day_as: 0.5,          // for the monthly rate
  midday_boundary: "11:30",        // first|second half split for cover scoping (§5.8);
                                   // defaults to the start of the first period after the main break
  count_late_as: 1.0,
  count_official_duty_as: 1.0,
  unpaid_absence_deduction: false  // mirrors PRODUCT-DECISIONS 6.3 cover policy
}
```

**5.2 Default leave types** seeded per school (BD private-school norms, all editable): Casual 10 days · Sick 14 days · Earned 0 (accrual off by default) · Maternity 120 days (unpaid flag off) · Unpaid unlimited · Official Duty unlimited (does not consume balance, counts as present).

**5.3 Status derivation on self check-in:**

```
if check_in_at <= on_time_until            -> present
else                                        -> late, minutes_late = check_in_at - on_time_until
on check-out: worked = check_out_at - check_in_at
if worked < half_day_before_minutes         -> half_day, half = 'second'   (they worked the morning and left)
```

When an admin sets `half_day` explicitly, the sheet **requires** a half — "Which half?" is a two-button segmented control, not an optional extra — because the cover engine cannot schedule a substitute for "half a day" that names no half. A `half_day` derived from an early check-out defaults to `second`; a member who arrives after the midday boundary is recorded `half_day` with `half = 'first'`.
An admin's explicit status always overrides a derived one and sets `source='admin'`.

**5.4 Leave days calculation:**

```
days = count of dates d in [starts_on, ends_on] where d is a school day
       (in school_profiles.working_days AND not a holiday per F-AC-11)
minus 0.5 if half_day_start
minus 0.5 if half_day_end
```

Weekends and holidays inside a range are **not** consumed from the balance. `days` is stored, not recomputed at read time, so a later calendar edit cannot silently change an approved request.

**5.5 Leave balance:**

```
entitled  = leave_types.annual_entitlement_days (pro-rated: entitled * days_remaining_in_year / days_in_year
            when the member joined mid-year; setting `prorate_on_join`, default true)
carried   = min(previous_year.remaining, leave_types.carry_forward_cap) when carry_forward
taken     = Σ days of approved requests in the year
pending   = Σ days of pending requests in the year
remaining = entitled + carried - taken - pending
```

`remaining < 0` is allowed and displayed in red as "over balance"; it never blocks a request.

**5.6 Monthly staff attendance rate** (replacing the prototype's formula, which counted Half Day as a full day and ignored leave):

```
weighted_present = count(present) * 1.0
                 + count(late) * count_late_as          (default 1.0)
                 + count(half_day) * count_half_day_as  (default 0.5)
                 + count(official_duty) * count_official_duty_as
working_days     = school days in the month per F-AC-11 and working_days
rate             = round(100 * weighted_present / working_days, 2)   // 0 when working_days = 0
```

Paid leave is reported **separately** as leave days; it is neither present nor absent. Unpaid leave counts as absent for the rate. The denominator is the school calendar, not the number of rows that happen to exist — an unmarked day is an absence in the report and is flagged as "unmarked" so the office can fix it.

**5.7 Worked minutes** = `check_out_at - check_in_at` when both exist, else null. Monthly total ignores nulls and reports "n days without check-out".

**5.8 Cover trigger contract.** Emitting

```
cover.trigger { workspace_id, member_id, date,
                half: 'first' | 'second' | null,      // null = whole day
                reason: 'absent' | 'on_leave' | 'missed_punch' }
```

is this feature's only obligation to the cover engine; ranking, rates and confirmation all live in the operations area (PRODUCT-DECISIONS 6.3). **`half` is copied straight from `staff_attendance.half`**, so the engine scopes its cover requests to the affected periods: `first` covers only slots whose bell period starts before the school's midday boundary (`policy.midday_boundary`, default the start of the first period after the main break), `second` covers only those at or after it, and `null` covers the whole day. The event is emitted exactly once per `(member, date, half, reason)` — that tuple is the dedupe key on the `jobs` row, so a member marked half-day-first in the morning and then absent for the whole day produces a second, wider trigger rather than a silent no-op.

**5.9 Extra-hours feed.** For payroll, this feature exposes `staffMonthlySummary(ctx, memberId, month)` including leave days by type and late minutes. Cover extra-hours (`Σ period minutes / 60`) are computed by the cover engine, not here.

**5.10 Self-service boundaries.** A member can create only their own row, only for today, and only via check-in/check-out. They can never set a status, never change a past day, and never see another member's row — all three enforced by RLS, not by the UI (the prototype enforced none of them).

**5.11 Timezone.** "Today" and every window comparison use `school_profiles.timezone` in SQL.

## 6. UI

| Screen               | Route                              | 360×800                                                                                    | ≥1024                                                   | Primary action       | Empty                                 | Loading         | Error                                                  |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------- | ------------------------------------- | --------------- | ------------------------------------------------------ |
| Check-in card        | `/app/dashboard`                   | Full-width 64 px button with live clock; after check-in shows "In at 07:52 · Check out"    | Same card in the top-right widget column                | Check in / Check out | n/a                                   | Button spinner  | Inline error with retry; never blocks the dashboard    |
| Staff grid (today)   | `/app/staff/attendance`            | Vertical list of members, status pill right-aligned, sticky counts bar                     | Table: member, role, in, out, status, note; inline edit | Mark all present     | "No staff members yet → invite staff" | 8 skeleton rows | Retry banner                                           |
| Member history       | `/app/staff/attendance/[memberId]` | Month strip + list of non-present days                                                     | Month grid + trend                                      | Edit a day (admin)   | "No records"                          | Skeleton        | Retry                                                  |
| Monthly summary      | `/app/staff/attendance/summary`    | Per-member cards with heat strip and rate                                                  | Full table with all columns + heat strips               | Export CSV / PDF     | "No data for this month"              | Skeleton        | Retry                                                  |
| Leave list (mine)    | `/app/staff/leave`                 | Cards: type, dates, days, status chip                                                      | Table + right detail panel                              | Apply for leave      | "No leave requests"                   | Skeleton        | Retry                                                  |
| Leave approvals      | `/app/staff/leave?tab=pending`     | Cards with balance + timetable impact, Approve / Reject buttons side by side at the bottom | Table with a detail drawer                              | Approve              | "Nothing pending"                     | Skeleton        | Retry                                                  |
| Apply for leave      | sheet                              | Type (with balance inline), date range, half-day toggles, reason, document upload          | Dialog                                                  | Submit               | n/a                                   | Spinner         | Field errors + `LEAVE_OVERLAP` shown on the date field |
| Leave types & policy | `/app/settings/staff/leave`        | Grouped list with entitlement steppers                                                     | Two-column                                              | Add leave type       | "Use the default set" one-tap seed    | Skeleton        | Field errors                                           |

`packages/ui`: `CheckInButton` (with live clock and optimistic state), `StatusRowList` (shared with F-AC-03's roll-call primitive), `HeatStrip`, `BalanceChip`, `DateRangeSheet` (with half-day toggles), `ApprovalCard`, `SummaryTable`, `EmptyState`, `ConfirmSheet`.

## 7. Server contracts

| Action / handler                            | Input schema (Zod)                                                                                                                                 | Output                  | Errors                                                                                                                                                                        | Idempotency                                                     | Rate limit   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| `selfCheckIn`                               | `SelfCheckInInput` {lat?, lng?, device?}                                                                                                           | `StaffAttendance`       | `CHECKIN_WINDOW_CLOSED`, `SELF_CHECKIN_DISABLED`, `ALREADY_CHECKED_IN` (returns the row)                                                                                      | key on (member, date, 'in')                                     | 30/h/user    |
| `selfCheckOut`                              | `SelfCheckOutInput` {}                                                                                                                             | `StaffAttendance`       | `NOT_CHECKED_IN`, `ALREADY_CHECKED_OUT`                                                                                                                                       | key on (member, date, 'out')                                    | 30/h/user    |
| `markStaffAttendance`                       | `MarkStaffAttendanceInput` {memberId, date, status, **half?: 'first'\|'second'**, note?, minutesLate?}                                             | `StaffAttendance`       | `MEMBER_NOT_ACTIVE`, `DATE_IN_FUTURE`, `YEAR_CLOSED`, **`HALF_REQUIRED`** (status `half_day` with no half), **`HALF_NOT_ALLOWED`** (half sent with `present`/`absent`/`late`) | key on (member, date)                                           | 600/h        |
| `bulkMarkStaffAttendance`                   | `BulkMarkStaffInput` {date, entries: [{memberId, status, half?}]}                                                                                  | `BulkResult`            | partial per-member results, same named errors                                                                                                                                 | **key required**                                                | 60/h         |
| `updateStaffAttendanceNote`                 | `StaffNoteInput` {recordId, note}                                                                                                                  | `StaffAttendance`       | —                                                                                                                                                                             | —                                                               | 300/h        |
| `requestLeave`                              | `RequestLeaveInput` {leaveTypeId, startsOn, endsOn, halfDayStart, **halfDayStartHalf?**, halfDayEnd, **halfDayEndHalf?**, reason, documentFileId?} | `LeaveRequest`          | `LEAVE_OVERLAP`, `MAX_CONSECUTIVE_EXCEEDED`, `DOCUMENT_REQUIRED`, `OVER_BALANCE` (warning payload, not fatal)                                                                 | key required                                                    | 30/h/user    |
| `withdrawLeave`                             | `LeaveIdInput`                                                                                                                                     | `LeaveRequest`          | `NOT_PENDING`                                                                                                                                                                 | —                                                               | 30/h         |
| `decideLeave`                               | `DecideLeaveInput` {requestId, decision: 'approved'                                                                                                | 'rejected', note?}      | `LeaveRequest`                                                                                                                                                                | `ALREADY_DECIDED`, `LEAVE_OVERLAP`, `NOTE_REQUIRED` (on reject) | key required | 300/h |
| `cancelApprovedLeave`                       | `CancelLeaveInput` {requestId, reason}                                                                                                             | `LeaveRequest`          | `NOT_APPROVED`                                                                                                                                                                | key required                                                    | 60/h         |
| `upsertLeaveType`                           | `LeaveTypeInput`                                                                                                                                   | `LeaveType`             | `CODE_TAKEN`, `IN_USE` (on deactivate)                                                                                                                                        | —                                                               | 60/h         |
| `seedDefaultLeaveTypes`                     | `{}`                                                                                                                                               | `{created:number}`      | `ALREADY_SEEDED`                                                                                                                                                              | key on (workspace,'leave-seed')                                 | 3/h          |
| `updateStaffAttendancePolicy`               | `StaffAttendancePolicyInput` (the §5.1 object)                                                                                                     | `SchoolProfile`         | `INVALID_WINDOW`                                                                                                                                                              | —                                                               | 60/h         |
| `GET /api/staff/attendance/summary`         | `StaffSummaryQuery` {month, memberId?, format:'json'                                                                                               | 'csv'}                  | summary rows or CSV                                                                                                                                                           | `FORBIDDEN`                                                     | —            | 120/h |
| `POST /api/pdf/staff-attendance-summary`    | `StaffSummaryPdfInput` {month, queuePrint?}                                                                                                        | `{fileId, printJobId?}` | —                                                                                                                                                                             | key required                                                    | 30/h         |
| `runMissedPunchJob` (cron, service role)    | `{workspaceId?}`                                                                                                                                   | `{notified:number}`     | —                                                                                                                                                                             | dedupe per (member, date)                                       | 1/school-day |
| `recomputeLeaveBalances` (cron + on demand) | `{academicYearId}`                                                                                                                                 | `{updated:number}`      | —                                                                                                                                                                             | idempotent                                                      | 1/night      |

Exported selectors: `staffMonthlySummary(ctx, memberId, month)`, `isOnLeave(ctx, memberId, date)` (used by F-AC-05's teacher view and by the cover engine), `absentMembersOn(ctx, date)`.

## 8. Parts (build chunks)

**Part 1 — Table, policy and self check-in** · `staff_attendance` with the `(member_id, date)` unique index, enums, RLS including the own-row-today-only self policy, `staff_attendance_policy` defaults, `selfCheckIn`/`selfCheckOut` with status derivation, the dashboard check-in card · tests: pgTAP proving a teacher can read only their own rows and can only write today's check-in columns; unit tests for status derivation across the on-time boundary in Asia/Dhaka · **Demo:** a teacher taps Check in at 07:52 and sees "Present · in at 07:52"; a second tap is a no-op.

**Part 2 — Admin grid** · member list sourced from `workspace_members` (never a platform user list), status cycling, long-press for the full set, notes, batched `bulkMarkStaffAttendance` with one upsert statement, admin-over-self precedence · tests: double-tap Mark-all produces no duplicates; a removed member cannot be marked · **Demo:** an admin marks 24 staff in one screen; pressing Mark-all twice changes nothing.

**Part 3 — Leave types, requests and balances** · `leave_types` + BD seed, `leave_requests` with the overlap exclusion constraint, `leave_balances` with the §5.5 formula and the nightly recompute, apply sheet with inline balance, my-leave list · tests: day-count unit tests over weekends, holidays and half-days; balance pro-rating on mid-year join; exclusion-constraint pgTAP · **Demo:** a teacher applies for 3 days of casual leave spanning a Friday holiday and the request shows 2.0 days.

**Part 4 — Approval, auto-marking and the cover trigger** · approval screen with timetable impact from F-AC-05, `decideLeave` creating `on_leave` attendance rows transactionally, balance movement, cancel-future-only, `cover.trigger` emission with dedupe, `leave.requested` / `leave.decided` notifications · tests: integration asserting exactly one `cover.trigger` per affected date and none for weekends; cancellation removes only future rows · **Demo:** approve a teacher's 3-day leave and watch three cover triggers appear in the jobs table with their timetable slots attached.

**Part 5 — Monthly summary, export and missed-punch job** · summary query over the calendar denominator, heat strips, CSV export, React-PDF staff attendance summary with the school header, `runMissedPunchJob` with admin notification and a one-tap mark-absent action, `staff_attendance.exported` audit · tests: summary fixture including leave, half days, unmarked days and a mid-month joiner; job idempotency · **Demo:** export March's summary to PDF; totals match the grid, unmarked days are flagged, and at 08:30 admins are told that two teachers with periods have not checked in.

## 9. Acceptance criteria

1. **Given** a teacher on a phone at 07:52 with `on_time_until = 08:00`, **when** they tap Check in, **then** one `staff_attendance` row exists for today with `status='present'`, `source='self'`, and the button becomes Check out.
2. **Given** the same teacher taps Check in twice, **when** the second call arrives, **then** the same row is returned and no duplicate is created.
3. **Given** a teacher checks in at 08:20, **when** the row is created, **then** `status='late'` and `minutes_late = 20`.
4. **Given** a teacher, **when** they request `staff_attendance` rows for another member by id, **then** RLS returns nothing — proved by a pgTAP negative test, not by hiding the screen.
5. **Given** a teacher, **when** they attempt to write a status or to modify yesterday's own row, **then** both the permission check and the RLS self policy refuse it.
6. **Given** an admin on the grid with 24 members, **when** they tap "Mark all present" twice, **then** exactly 24 rows exist and the second call is a no-op (idempotency key).
7. **Given** a member who self-checked-in as late, **when** an admin marks them `official_duty`, **then** the admin's value wins, `marked_by` is recorded, and the check-in time is preserved on the row.
8. **Given** an approved leave from 3–5 March where 4 March is a holiday, **when** the days are computed, **then** `days = 2.0` and no balance is consumed for 4 March.
9. **Given** a leave request overlapping an existing approved one, **when** it is submitted, **then** it is refused with `LEAVE_OVERLAP` and the conflicting dates are shown on the date field.
10. **Given** a member with 1.0 casual day remaining, **when** they request 3 days, **then** the request is accepted with an "over balance by 2 days" warning and the approver sees it — it is never silently blocked.
11. **Given** an admin approves a 3-day leave for a teacher with 7 periods in that range, **when** approval completes, **then** three `staff_attendance` rows with `status='on_leave'` exist, the balance moves from pending to taken, and exactly three `cover.trigger` events are queued (one per school day, none for the weekend).
    11b. **Given** an admin marks a teacher `half_day` with no half selected, **when** the action runs, **then** it is refused with `HALF_REQUIRED`; **given** `half = 'first'`, **then** the row stores it and the emitted `cover.trigger` carries `half: 'first'`, so the cover engine requests substitutes only for that teacher's pre-midday periods and leaves the afternoon slots untouched.
    11c. **Given** a leave from 3–5 March with `half_day_start = true` and `half_day_start_half = 'second'`, **when** it is approved, **then** 3 March's `staff_attendance` row has `half = 'second'`, 4 and 5 March have `half = null`, and the three cover triggers carry exactly those values.
12. **Given** an approved leave that has already started, **when** an admin cancels it, **then** only future `on_leave` rows are removed, past ones remain, and `cover.cancelled` is emitted for the future dates only.
13. **Given** a month with 22 school days and a member with 18 present, 2 late, 1 half day and 1 paid sick day, **when** the summary is generated with default weights, **then** the rate is `round(100 × (18 + 2×1.0 + 1×0.5) / 22, 2) = 93.18`, and 1 sick day is reported separately in the leave column.
14. **Given** a day on which nobody marked a member, **when** the monthly summary runs, **then** that day appears as "unmarked" in the report rather than being silently excluded from the denominator.
15. **Given** a teacher with a timetable slot today who has not checked in by first period + 30 minutes, **when** the missed-punch job runs, **then** admins receive one `staff.missed_punch` notification with a one-tap "mark absent" action, and nobody is marked automatically.
16. **Given** a medical certificate attached to a sick-leave request, **when** another teacher requests that file, **then** the file route returns 403 and the attempt is written to `file_access_log`.
17. **Given** two workspaces, **when** a member of workspace A lists staff attendance, **then** no row from workspace B is returned (the exact defect the prototype shipped).

## 10. Tests

- **Unit (`packages/domain`)**: `deriveCheckInStatus`, `deriveHalfDayOnCheckout`, `leaveDays(range, workingDays, holidays, halfDayFlags)`, `leaveBalance` with pro-rating and carry-forward, `staffMonthlyRate` across every weight combination, `coverTriggerDates(range)` (weekends and holidays excluded, each carrying its `half`), `halfRequiredFor(status)`, `periodsInHalf(half, bellPeriods, middayBoundary)`, `isWithinCheckInWindow(now, policy, tz)`.
- **DB (pgTAP)**: isolation and escalation for `staff_attendance`, `leave_requests`, `leave_types`, `leave_balances`; the self policy (own row only, today only, check-in columns only); the `(member_id, date)` unique index under concurrent inserts; the approved-leave overlap exclusion constraint; `workspace_id` immutability; rates on `staff_records` unreadable by teachers.
- **Integration**: every action's happy path and named errors; `decideLeave` transactional creation of `on_leave` rows plus exactly-once cover triggers; `bulkMarkStaffAttendance` replay; `cancelApprovedLeave` future-only semantics; balance recompute convergence after a sequence of approve/cancel/withdraw.
- **E2E (360×800 and 1280×800, axe)**: `self-check-in`, `admin-marks-grid`, `apply-and-approve-leave`, `monthly-summary-export`. Axe clean on grid, leave list and approval card.
- **Security**: an e2e assertion that a teacher's staff-attendance payload contains no other member's row and no `hourly_rate` key; `file_access_log` written for every leave-document view; geolocation never present in a non-admin response.
- **Performance budgets**: grid for 120 members loads < 400 ms; `bulkMarkStaffAttendance` for 120 members is one statement, p95 < 300 ms; monthly summary for 120 members × 26 days < 800 ms; missed-punch job < 20 s per workspace.

## 11. Open questions

1. **Geofenced check-in.** Modelled and off by default; capture is advisory and never blocks. Assumed acceptable. If a school wants hard enforcement, that is a policy flag plus a refusal path — and a privacy notice, which SECURITY.md must cover before it ships.
2. **Biometric / RFID device integration** for staff punches. Assumed out of scope for v1 (same reasoning as gate scanning, PRODUCT-DECISIONS 2.1); the `source` enum already has room and the scan endpoint pattern from F-AC-03 would be reused.
3. **Payroll integration.** This feature exposes the summary; it computes no salary. Assumed: the ops-area payroll/expense work consumes `staffMonthlySummary` and `staff_records.hourly_rate`. `unpaid_absence_deduction` is stored here only because PRODUCT-DECISIONS 6.3 defines it as a school policy.
4. **Earned-leave accrual** (e.g. 1 day per 20 worked days). Entitlement is a flat annual number in v1 with accrual off. Assumed sufficient for private schools; accrual becomes a `leave_types.accrual_rule` jsonb if asked for.
5. **Half-day leave on non-adjacent days.** v1 supports half days only at the start and end of a range. Assumed fine; a single half day is a one-day range with `half_day_start = true` and a named half (which computes 0.5, not 0 — asserted by a unit test).
   5b. **Midday boundary.** `policy.midday_boundary` splits the day into `first`/`second` for cover scoping. Assumed: it defaults to the start of the first period after the main break in the bell schedule (F-AC-05) and is editable. Schools whose halves are uneven (four periods then two) get exactly what they configure; the engine never guesses.
6. **Who approves an admin's own leave?** Assumed: any other owner/admin, and an owner may approve their own with an audit event noting self-approval. Confirm with the owner whether self-approval should be blocked outright.
