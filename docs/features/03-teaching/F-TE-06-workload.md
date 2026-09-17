# F-TE-06 — Teacher workload: scheduled vs logged

|                  |                                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | teaching                                                                                                                                                                                                                    |
| Status           | planned                                                                                                                                                                                                                     |
| Owner branch     | `feat/teaching-workload`                                                                                                                                                                                                    |
| Depends on       | F-AC-06 (timetable / `timetable_slots`) · F-AC-03 (`section_subjects`, incl. assistant teachers) · F-TE-02 (`lesson_logs`) · F-OP-03 (staff attendance and leave) · F-OP-02 (academic calendar) · F-OP-01 (`staff_records`) |
| Depended on by   | F-TE-07 (staff/workload dashboard) · F-OP-08 (cover teacher — shares the "who is free at period P" query)                                                                                                                   |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 6                                                                                                                                                                         |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §4 rows 11–11c, 13d, §5.6, §6 "Teacher workload (periods/week)", §7 items 44–45, §8 Q12                                                                       |

## 1. Purpose

Two numbers, side by side, for every teacher: **what the timetable says they teach** and **what they actually taught**. The first is the school's plan; the second is the truth. The gap between them is the most useful management number a head teacher has — it shows who is drowning, who is covering for everyone else, and which sections are quietly losing periods.

Teachers get a personal cockpit: this week's periods, what I have logged, what is due, my extra cover hours. Admins get a balance view: **scheduled** periods per teacher, burnout banding against school-set thresholds (computed from scheduled + cover, never from logged periods), and suggested rebalances. **Logged periods and variance are teacher-private by default** (research-debate synthesis T-01, R1) — an admin sees a teacher's variance report only if that teacher has opted to share it; see §5.5a. Nothing here is AI.

**What Base44 intended, and what was broken.** The Workload Balancer counted `ScheduleSlot` rows per teacher and banded them — real maths over real rows, but joined **by display-name string**: `ScheduleSlot.class_id → Class.teacher_name`, matched against `TeacherAttendance.teacher_name`. No user ids anywhere. Two spellings of "S. Rahman" produced two teachers; renaming a teacher orphaned their history; and `Class.teacher_name` was a single free-text field, so co-teaching could not exist. Its "Absences (last 30 days)" label had **no date filter at all** — the query was the most recent 200 attendance rows school-wide over any time range. And `LessonLog.periods_used` — the ground truth of teaching load, already captured — was not used by the balancer at all. The teacher-facing `/workload` page was three read-only tabs (an assignment-deadline calendar, a flagged-student list, a quick log form) with a deadline countdown computed as a millisecond diff, so a deadline two hours away rendered as "Tomorrow".

**Done looks like:** every join is on `user_id`, every window has an explicit date range, `periods_used` is a first-class input, and the balancer's suggestions name a specific slot to move and say what it would cost.

## 2. Roles and permissions

| Action                                                                                    | permission key                                            | owner | admin | teacher | staff | parent | platform    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----- | ----- | ------- | ----- | ------ | ----------- |
| See my own workload (scheduled + logged + variance)                                       | `workload.read.own`                                       | ✓     | ✓     | ✓       | ✓     | —      | —           |
| See every teacher's **scheduled** load + band (always)                                    | `workload.read.any`                                       | ✓     | ✓     | —       | —     | —      | read bypass |
| See a teacher's **logged periods / variance** (only if that teacher has opted in — §5.5a) | `workload.read.any` + the teacher's `share_variance` flag | ✓     | ✓     | —       | —     | —      | read bypass |
| Opt my own variance in/out of admin visibility                                            | `workload.share.own`                                      | ✓     | ✓     | ✓       | ✓     | —      | —           |
| See the balance suggestions                                                               | `workload.balance`                                        | ✓     | ✓     | —       | —     | —      | —           |
| Act on a suggestion (reassign a slot)                                                     | `timetable.write` (F-AC-06)                               | ✓     | ✓     | —       | —     | —      | —           |
| Edit burnout thresholds                                                                   | `workload.settings`                                       | ✓     | ✓     | —       | —     | —      | —           |
| Export the variance report                                                                | `workload.read.any`                                       | ✓     | ✓     | —       | —     | —      | —           |
| See hourly rates alongside workload                                                       | `staff.compensation.read`                                 | ✓     | ✓     | —       | —     | —      | —           |

Hourly rates (`staff_records.hourly_rate`) are admin-only visibility per PRODUCT-DECISIONS 6.3 and are never returned to a teacher's own workload payload, even for themselves — pay lives in the staff module, not here.

**Owner/admin are never blocked from `workload.read.any`, but that permission alone only ever returns scheduled periods, cover and band.** Logged periods and variance are a second, narrower grant gated additionally by the individual teacher's own sharing choice (§5.5a) — a platform-level or role-level "can read workload" permission is not sufficient to see what a teacher actually taught versus what was timetabled.

## 3. Data

This feature **owns almost no tables**. It is calculations over other modules' rows, exposed as SQL views and server actions. That is deliberate: the prototype's problem was not missing data, it was bad joins over data that already existed.

### 3.1 Read-only inputs

| table                                | what it provides                                                                                             | notes                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `timetable_slots` _(F-AC-06)_        | `(workspace_id, section_subject_id, weekday, period_number, duration_minutes, effective_from, effective_to)` | the scheduled load                                                                                                                          |
| `section_subjects` _(F-AC-03)_       | `(workspace_id, section_id, subject_id, teacher_id, role)`                                                   | **`role ∈ primary \| assistant`** — PRODUCT-DECISIONS 3.8. One primary, zero or more assistants. This is what replaces `Class.teacher_name` |
| `lesson_logs` _(F-TE-02)_            | `(section_subject_id, taught_on, period_number, periods_used, logged_by, coverage)`                          | the actual load                                                                                                                             |
| `staff_attendance` _(F-OP-03)_       | `(workspace_id, user_id, date, status)`                                                                      | absences and leave, joined on **`user_id`**                                                                                                 |
| `cover_assignments` _(F-OP-08)_      | `(workspace_id, cover_teacher_id, absent_teacher_id, date, period_number, minutes)`                          | extra hours worked                                                                                                                          |
| `academic_calendar_days` _(F-OP-02)_ | instructional days                                                                                           | the denominator for every "per week" number                                                                                                 |
| `workspace_members`                  | active teaching staff                                                                                        | the row set; never a `users.role` column                                                                                                    |
| `school_profiles`                    | `working_days`, `timezone`, `period_minutes`                                                                 |                                                                                                                                             |

### 3.2 Settings this feature adds (proposed columns on `school_profiles`)

`workload_thresholds jsonb not null default '{"healthy_max":26,"moderate_max":30,"burnout_min":32,"window":"week"}'`.
`workload_variance_tolerance_pct smallint not null default 15`.
`workload_count_assistants boolean not null default false` — whether an assistant teacher's slot counts toward their load (default: no, it counts at 0.5 in the display but not toward the burnout band; see §5.3).

**Defaults corrected from the research-debate synthesis (T-02, R1).** The prototype's `WARN_THRESHOLD = 20` / `BURNOUT_THRESHOLD = 25` periods/week were carried forward unexamined in an earlier draft and flagged normal Bangladeshi private-school load as burnout: BD private-school teachers routinely teach **28–32 periods/week**, so a 20/25 default banded most of a real staff room as "High" on day one. Corrected fixed defaults: **`healthy_max 26 / moderate_max 30 / burnout_min 32`**. These remain a **setting**, not a hard-coded constant, because a BD school with 8-period days and a Sat–Thu week still has a different normal from an international school — but the shipped default now reflects the BD norm rather than the prototype's unexamined number.

### 3.2a `workload_sharing_prefs` (new; proposed — teacher-private variance, R1)

Per-teacher, per-workspace: `workspace_id`, `user_id`, `share_variance boolean not null default false`, `updated_at`. Primary key `(workspace_id, user_id)`. **Default off** — a teacher's logged-periods and variance numbers are private until they explicitly opt in from their own `/app/workload` page. Admin's default balance-view row (§4.2) and the variance report (§4.4) show only what §5.5a permits regardless of this row's existence; the row simply upgrades a specific teacher's visibility when they set it `true`. RLS: a teacher can read/write only their own row; owner/admin can read all rows in their workspace (to know who has opted in) but cannot write another member's row — the choice belongs to the teacher, not the school.

### 3.3 Views this feature owns

Defined in F-TE-07 §4.4 (they are also the staff dashboard's source): `analytics_workload_scheduled`, `analytics_workload_logged`, `analytics_workload_variance`, `analytics_workload_cover`. Materialised? **No** — they are computed on read with indexes behind them; a materialised view would be stale exactly when a head teacher is looking at it (right after a timetable change).

### 3.4 `workload_suggestions` (ephemeral, not stored)

Suggestions are computed per request, not persisted. Acting on one is a normal `timetable.reassignSlot` call in F-AC-06, which carries its own audit. Storing stale suggestions would create a second source of truth about the timetable.

## 4. Workflows

### 4.1 My workload (teacher)

**Trigger:** `/app/workload`, or the workload card on the dashboard.

1. Header: the current week (Sat–Thu by default from `school_profiles.working_days`), with arrows to move week by week and a "this week" reset.
2. **Two big numbers side by side:** "Scheduled 22 periods" and "Logged 18 periods", with the difference as a labelled delta ("4 not yet logged") — never as a bare negative number.
3. Below: a day strip (Sat…Thu) showing each day's periods as small blocks, logged blocks filled, unlogged blocks outlined, cover periods marked with a distinct token. Tapping an unlogged block opens F-TE-02's quick-log sheet pre-filled for that slot. This is the single most valuable interaction in the feature: the workload view is also the logging prompt.
4. Cards: **Extra cover this month** (hours and count), **Sections I teach** (with my role, primary or assistant), **Unlogged periods older than 7 days** (a nudge list, capped at 10).
5. **Share my variance with admin** — a toggle, **off by default** (§5.5a, §3.2a). Off explains itself: _"Your admin sees your scheduled periods and band. Your logged periods and variance stay private unless you turn this on."_ On adds: _"Your admin can now see how your logged periods compare to your schedule."_ The toggle is the teacher's own, revocable at any time, and takes effect immediately.
6. **Outcome:** read-only except for the quick log (F-TE-02) and this sharing toggle.
7. **Failures:** a section-subject with no timetable slot renders as "not timetabled" rather than as zero; a week with no instructional days (holidays) says so instead of showing an empty grid.

### 4.2 Balance view (admin)

**Trigger:** `/app/workload/balance`.

1. A ranked list of active teaching members for the selected window (week / month / term), each row: name, **scheduled** periods, cover hours, absences in the window, and a RAG band (computed from scheduled + cover, §5.6 — never from logged periods). **Logged periods and variance % show only for a teacher who has opted in (§5.5a, `workload_sharing_prefs.share_variance = true`)**; for everyone else the cell reads "Private" with a small lock glyph, never a blank or a zero that could be misread as "taught nothing."
2. Sort defaults to scheduled periods descending — the drowning teacher is at the top.
3. Filters: subject, grade, band, "has variance beyond tolerance" (the last filter naturally excludes teachers who have not shared variance, and says so).
4. Tapping a row opens a drawer: their week grid, their sections, their absences **in the stated window** (§5.7 — the prototype labelled a window it did not apply), and the suggestions for them. **Variance by subject appears in the drawer only if that teacher has opted in**; otherwise the drawer shows the same "Private" state as the list row.
5. **Failures:** a workspace with no timetable shows "Build a timetable to see workload" rather than a page of zeros.

### 4.3 Balance suggestions

**Trigger:** the "Suggestions" tab on the balance view, or the drawer for one teacher.

For each teacher above `burnout_min`, the engine proposes moving specific `timetable_slots` to specific teachers, ranked by §5.5. Each suggestion is a sentence a human can check:

> Move **Class 8-B Mathematics, Sunday period 4** from **S. Rahman (26)** to **F. Akter (17)**. F. Akter teaches Mathematics, is free at that period, and would go to 18. S. Rahman would go to 25.

Actions: **Apply** (calls `timetable.reassignSlot`, which notifies both teachers and audits), **Dismiss** (hides for 30 days, stored per-admin in `user_preferences`), or **Open timetable** to do something else. Applying re-runs the engine so the list never shows a stale suggestion.

Failure: if applying would break a constraint the timetable module owns (double-booking, a subject the target cannot teach), `timetable.reassignSlot` refuses and the suggestion is removed with the reason shown.

### 4.4 Variance report

**Trigger:** `/app/workload/variance`, or Export from the balance view.

Per section-subject over a chosen range: scheduled periods, logged periods, variance count and %, periods logged as `skipped`, periods spent off-syllabus, and the top reasons where notes exist — **section-subject aggregates are always visible to admin**, since they answer a coverage question about the timetable, not a judgement about one teacher.

**Per-teacher rows are gated by §5.5a.** A teacher who has not opted in via `workload_sharing_prefs.share_variance` does not appear as a named row in the per-teacher breakdown or export — their periods still count in the section-subject aggregate (anonymously), but there is no on-screen or CSV path that names them next to a variance number without their consent. CSV export uses the same view as the screen, so the exported numbers and the on-screen numbers cannot disagree, and cannot disagree about _who_ is named either.

Two readings the report is built to support: "6-C English has lost 11 periods this term" (a coverage problem, always visible) and "S. Rahman logs 30 % fewer periods than they teach" (a logging-discipline problem about one named teacher, visible to admin only once S. Rahman has shared it). The report labels the difference rather than implying blame.

### 4.5 Thresholds

`/app/settings/workload`: healthy max, moderate max, burnout min, variance tolerance %, whether assistant slots count. A live preview re-bands the current week's teachers as the sliders move, so an admin can see "3 teachers would move to High" before saving. Saving audits the change.

### 4.6 Phone flow, explicitly

- `/app/workload` is a **stack**: week header, the two big numbers, the day strip (horizontally scrollable, each day a column of blocks), then cards. No tables.
- Tapping a block is the primary interaction; blocks are ≥44 px tall with ≥8 px gaps.
- The balance view on phone is a **card list**, not a table: name, two numbers, a band pill, a chevron. The drawer is a full-height sheet.
- Suggestions are **cards with the sentence and two buttons** (Apply / Dismiss) — a table of proposed swaps is unreadable at 360 px.
- The variance report on phone shows the top 10 rows with "Export CSV" for the rest; the full table appears at ≥1024.

## 5. Business rules and calculations

**5.1 Every join is on `user_id`.** Scheduled load comes from `timetable_slots → section_subjects.teacher_id`; absences from `staff_attendance.user_id`; logs from `lesson_logs.logged_by` and `section_subjects.teacher_id`. No display-name string is a join key anywhere in this feature. This is the structural correction of the prototype's central defect.

**5.2 Scheduled periods in a window.**

```
scheduled_periods(user, from, to) =
  count of (date, period_number) pairs where
    date between from and to
    and date is an instructional day (academic_calendar_days)
    and isodow(date) is in school_profiles.working_days
    and a timetable_slots row exists with that weekday and period,
        effective_from <= date and (effective_to is null or effective_to >= date),
        whose section_subject has teacher_id = user (role = 'primary',
        plus role = 'assistant' when workload_count_assistants)
```

Expressed per week, per month or per term by the chosen range. Never `slots × weeks` — a holiday week has fewer periods, and that is the whole point.

**5.3 Assistant weighting.** When `workload_count_assistants = false` (default), an assistant's slots are displayed at **0.5 period** for information and excluded from the burnout banding. When true, they count at full weight. The setting exists because "assistant" means very different things in different schools, and guessing produces either invisible co-teachers or inflated bands.

**5.4 Logged periods in a window.**
`logged_periods(user, from, to) = Σ lesson_logs.periods_used where logged_by = user (or the section_subject's teacher is user) and taught_on between from and to`.
`periods_used` is `numeric(3,1)`, so half-periods are preserved. Base44 counted rows and ignored this column entirely.

**5.5 Variance.**
`variance_periods = logged_periods − scheduled_periods`.
`variance_pct = round(100 × variance_periods / NULLIF(scheduled_periods, 0))`.
Beyond `±workload_variance_tolerance_pct` (default 15), the row is flagged. A **positive** variance (taught more than scheduled) is flagged too — it usually means uncredited cover or an unrecorded timetable change, both of which matter.

**5.5a Variance visibility is teacher-private by default (research-debate synthesis T-01, R1; PRODUCT-DECISIONS §3.8).** `logged_periods`, `variance_periods` and `variance_pct` for a **named teacher** are computed for that teacher's own view unconditionally, but are only ever returned to an admin/owner query when `workload_sharing_prefs.share_variance = true` for that `user_id` (§3.2a). Everything admin sees **by default** — the balance-view band (§5.6), the suggestion engine (§5.9) — is derived from `scheduled_periods` and `cover_periods` alone, never from `logged_periods`, so none of it requires this opt-in to function correctly. This exists because logged-vs-scheduled variance can read as a proxy for "is this teacher slacking," and turning it into an always-on admin surveillance number — for a metric whose primary purpose is the teacher's own logging prompt (§4.1) — is exactly the kind of advisory-only staff metric the safeguarding decision (`docs/product/research/DECISION-CHANGES.md` §2, C-03/T-03) requires be opt-in and never an automated basis for an employment decision.

**5.6 Banding.** Against `total_load = scheduled_periods_this_week + cover_periods_this_week`:

- `total_load >= burnout_min` (default 32) → **High**
- `moderate_max >= total_load >= healthy_max` … precisely: `healthy_max < total_load < burnout_min` (default 26 < x < 32) → **Moderate**
- `total_load <= healthy_max` (default ≤26) → **Healthy**
  Thresholds are per week; when the window is a month or term, the threshold is scaled by the number of instructional weeks in the window, not applied raw. The prototype applied a weekly threshold to an unbounded row set.

**5.7 Absences are always windowed.** `absences(user, from, to) = count of staff_attendance rows for that user in [from, to] with status ∈ {absent, on_leave}`. The UI label states the window explicitly ("absent 2 days, 1–31 March"). There is no code path in this feature that counts attendance without a date range — the prototype's "(last 30 days)" label over an unfiltered query is a regression test (§9.9).

**5.8 Cover hours.** `cover_minutes(user, from, to) = Σ cover_assignments.minutes where cover_teacher_id = user and date in window and status = 'completed'`. `extra_hours = cover_minutes / 60`, matching PRODUCT-DECISIONS 6.3's definition so the workload view and the payroll impact cannot disagree.

**5.9 Suggestion ranking.** For a slot `S` belonging to an over-loaded teacher `A`, a candidate `B` is eligible when **all** hold:

1. `B` is an active member with role `teacher`, `admin` or `owner`;
2. `B` has no `timetable_slots` row at `S`'s weekday and period (free);
3. `B` is not already scheduled elsewhere at that period as an assistant;
4. `B`'s resulting total load stays below `burnout_min`.
   Eligible candidates are scored, higher is better:

```
score = 3 × teaches_same_subject(B, S.subject)          // already qualified
      + 2 × teaches_same_grade(B, S.grade_level)        // knows the cohort
      + 1.5 × (burnout_min − B.total_load) / burnout_min // has the most headroom
      + 1 × already_teaches_this_section(B)              // knows the class
      − 2 × (B.total_load + 1 > moderate_max ? 1 : 0)    // don't create the next problem
```

Ties broken by lowest current load, then alphabetically for determinism. **Suggestions use the _scheduled_ timetable, not logged periods** (PRODUCT-DECISIONS 3.8) — you can only move a future slot, and the timetable is what exists in the future. Logged periods appear in the variance report, which answers a different question.

**5.10 Unlogged nudge.** A slot is "unlogged" when an instructional date in the past has a `timetable_slots` occurrence with no matching `lesson_logs` row for that `(section_subject, date, period)`. The nudge list shows the oldest first, capped at 10, and excludes dates before the teacher joined or after they were removed.

**5.11 Day boundaries.** Every "today", "this week" and window boundary is computed in `school_profiles.timezone` (default `Asia/Dhaka`) in SQL. `first_day_of_week` derives from `working_days` (Saturday for a Sat–Thu school). No millisecond arithmetic anywhere: a date difference is `date - date` in days, which is also the fix for the prototype's "deadline in 2 hours shows as Tomorrow" countdown.

**5.12 Removed members.** A removed member disappears from the balance list and the suggestion pool immediately, but their historical variance rows remain in the report for closed windows — a school needs last term's numbers after a teacher leaves.

## 6. UI

| Screen      | Route                               | 360×800                                                                                                   | ≥1024                                   | Primary                           | Empty                                                                | Loading                       | Error                                                    |
| ----------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------- | -------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| My workload | `/app/workload`                     | Week header · two big numbers · horizontal day strip of period blocks · cards (cover, sections, unlogged) | Two-column: week grid left, cards right | tap an unlogged block → quick log | "You have no timetabled periods yet."                                | Skeleton numbers + block grid | Inline `Alert`, week nav still works                     |
| Balance     | `/app/workload/balance`             | Card list ranked by load, band pill, chevron → full-height sheet                                          | Sortable table + drawer                 | Open suggestions                  | "Build a timetable to see workload."                                 | Skeleton rows                 | Inline                                                   |
| Suggestions | `/app/workload/balance#suggestions` | Sentence cards with Apply / Dismiss                                                                       | Same, two-up                            | Apply                             | "Everyone is inside your thresholds." (a genuinely good empty state) | Skeleton cards                | Inline; a refused apply removes the card with the reason |
| Variance    | `/app/workload/variance`            | Top-10 cards + Export CSV                                                                                 | Full table + filters + chart            | Export CSV                        | "No lessons logged in this range."                                   | Skeletons                     | Inline                                                   |
| Thresholds  | `/app/settings/workload`            | Sliders/steppers with a live "3 teachers would move to High" preview                                      | Same + the affected list                | Save                              | n/a                                                                  | Skeleton preview              | Inline                                                   |

Components: `StatTile`, `PeriodBlockGrid`, `WeekNav`, `RagBadge`, `DataList`, `DataTable`, `Drawer`/`Sheet`, `SuggestionCard`, `Stepper`, `EmptyState`, `ErrorState`. Bands use the design system's semantic status tokens, and every band is **also** labelled in text — never colour alone.

## 7. Server contracts

| Name                                | Input                                                                         | Output                                                                                                                                                                                  | Errors                                                | Idempotency      | Rate limit                    |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------- | ----------------------------- |
| `workload.me`                       | `{ from, to }` (defaults to the current week in workspace tz)                 | `{ scheduledPeriods, loggedPeriods, blocks: [{ date, periodNumber, sectionSubject, logged, isCover }], coverHours, sections[], unlogged[] }`                                            | —                                                     | —                | 120/min                       |
| `workload.school`                   | `{ from, to, subjectId?, gradeLevelId?, band?, flaggedOnly?, sort, cursor }`  | `{ rows: [{ userId, name, scheduled, coverHours, absences, band, logged?, variancePct?, shared: boolean }], nextCursor }` — `logged`/`variancePct` present **only** where `shared=true` | `FORBIDDEN`                                           | —                | 60/min                        |
| `workload.teacher`                  | `{ userId, from, to }`                                                        | the drawer payload (grid, sections, windowed absences, plus variance-by-subject **only if that teacher has opted in**, else `variance: null, shared: false`)                            | `FORBIDDEN`, `NOT_FOUND`                              | —                | 120/min                       |
| `workload.share.set`                | `{ shareVariance: boolean }`                                                  | `{ shareVariance }`                                                                                                                                                                     | `FORBIDDEN`                                           | key              | 20/day                        |
| `workload.suggestions`              | `{ from, to, userId? }`                                                       | `{ suggestions: [{ slotId, fromUserId, toUserId, rationale, fromLoadAfter, toLoadAfter, score }] }`                                                                                     | `FORBIDDEN`                                           | —                | 30/min                        |
| `workload.dismissSuggestion`        | `{ slotId, toUserId }`                                                        | `{ ok }`                                                                                                                                                                                | —                                                     | key              | 60/min                        |
| `workload.variance`                 | `{ from, to, groupBy: 'teacher'\|'section_subject', format?: 'json'\|'csv' }` | rows or a CSV stream — `groupBy:'section_subject'` is always full; `groupBy:'teacher'` includes only teachers with `share_variance=true`                                                | `FORBIDDEN`                                           | —                | 30/min                        |
| `workload.settings.get` / `.set`    | thresholds object                                                             | settings                                                                                                                                                                                | `FORBIDDEN`, `VALIDATION` (healthy_max < burnout_min) | key              | 20/day                        |
| _(reused)_ `timetable.reassignSlot` | `{ slotId, toUserId, effectiveFrom }`                                         | slot                                                                                                                                                                                    | `SLOT_CONFLICT`, `NOT_QUALIFIED`, `FORBIDDEN`         | key **required** | 30/min — **owned by F-AC-06** |

No action in this feature writes a timetable, a log or an attendance row. It reads and it suggests; the writes belong to the modules that own the data.

## 8. Parts (build chunks)

**Part 1 — Workload views and domain maths (≤2 days).**
Scope: the four SQL views (§3.3), the supporting indexes, and `packages/domain/workload.ts` implementing 5.2–5.10 against typed inputs.
Files: `supabase/migrations/*_workload_views.sql`, `packages/domain/src/workload.ts`, `packages/contracts/workload.ts`.
Tests: unit over a fixture school — a Sat–Thu week with two holidays, a mid-week timetable change via `effective_to`, a co-taught section, half-period logs, a teacher removed mid-window. Assert scheduled, logged, variance, band and cover for each. pgTAP: the views return zero rows across workspaces and respect member status.
**Demo:** a table of expected-vs-computed numbers for the fixture school, all matching, including the holiday and timetable-change cases.

**Part 2 — My workload (≤1.5 days).**
Scope: `/app/workload`, `workload.me`, the week navigator, the two headline numbers, the day strip with logged/unlogged/cover states, the cover and sections cards, the unlogged nudge list, and the tap-to-log hand-off into F-TE-02's sheet.
Tests: e2e at 360×800 — tap an unlogged block, log it, watch the block fill and "Logged" increase without a page reload; a holiday week renders its own message.
**Demo:** a teacher moves through three weeks, logs two missing periods from the grid, and sees both numbers converge.

**Part 3 — Balance view and thresholds (≤1.5 days).**
Scope: `workload.school`, the ranked card list and desktop table, filters, the per-teacher drawer with **windowed** absences, `/app/settings/workload` with the live re-band preview, settings validation and audit.
Tests: integration — absences honour the requested window exactly (the regression test for the prototype's unfiltered query); changing `burnout_min` re-bands without a reload; a non-admin gets `FORBIDDEN` from both the action and RLS.
**Demo:** slide `burnout_min` from 32 to 28 and watch three teachers move to High before saving.

**Part 4 — Suggestions and the variance report (≤2 days).**
Scope: the §5.9 ranking engine, suggestion cards with the plain-sentence rationale, Apply through `timetable.reassignSlot` with both teachers notified, Dismiss with a 30-day memory, the variance report with grouping, and CSV export sharing the view.
Tests: unit over the ranking function — a candidate who is busy at that period is never suggested; a candidate who would cross `burnout_min` is never suggested; ties are deterministic; the "everyone inside thresholds" empty state. Integration: applying a suggestion that the timetable refuses removes the card with the reason and changes nothing. CSV and screen numbers are byte-comparable for the same range.
**Demo:** apply one suggestion; both teachers' loads change on screen, both are notified, and an audit event names the actor.

Order: 1 → 2 → 3 → 4. Parts 2 and 3 can proceed in parallel after Part 1.

## 9. Acceptance criteria

1. **Given** two teachers whose display names are identical, **when** workload is computed, **then** they appear as two rows with correct, separate numbers — every join is on `user_id`.
2. **Given** a teacher is renamed, **when** workload is recomputed, **then** their history is intact.
3. **Given** a section-subject with a primary and an assistant teacher, **when** workload is computed with `workload_count_assistants = false`, **then** the primary carries the full period, the assistant sees it at 0.5 for information, and only the primary's band is affected.
4. **Given** a week containing two holidays, **when** scheduled periods are computed, **then** the holiday days contribute zero periods.
5. **Given** a timetable slot with `effective_to` before the window, **when** the window is computed, **then** that slot contributes zero.
6. **Given** a lesson log with `periods_used = 0.5`, **when** logged periods are summed, **then** the half is preserved and not rounded to 0 or 1.
7. **Given** a teacher scheduled 22 and logged 18, **when** my workload renders, **then** it shows "22 scheduled", "18 logged" and "4 not yet logged" — never a bare "−4".
8. **Given** a teacher who logged 26 against 22 scheduled, **when** variance is computed, **then** it is flagged as +18 % and the flag reason distinguishes over-teaching from under-logging.
9. **Given** a request for absences over March, **when** the drawer renders, **then** it counts only `staff_attendance` rows dated in March and the label states the window — no unfiltered attendance query exists in this feature.
10. **Given** thresholds 26/32 and a teacher on 33 scheduled including 2 cover periods, **when** banding runs, **then** they are **High**, and cover periods were included in `total_load`.
11. **Given** a month-long window, **when** the band is computed, **then** the weekly threshold is scaled by the number of instructional weeks, not applied raw.
12. **Given** an admin changes `burnout_min` from 32 to 28, **when** the preview updates, **then** it names exactly the teachers who would change band, before the setting is saved.
13. **Given** `healthy_max = 32` and `burnout_min = 26`, **when** the admin saves, **then** validation rejects it.
14. **Given** an overloaded teacher, **when** suggestions are computed, **then** every suggested target is free at that period, teaches an eligible subject where possible, and would stay under `burnout_min`.
15. **Given** no teacher is above `burnout_min`, **when** suggestions load, **then** the empty state says everyone is inside the thresholds.
16. **Given** a suggestion, **when** I press Apply, **then** the slot's teacher changes through `timetable.reassignSlot`, both teachers are notified, an audit event records the actor, and the suggestion list re-computes.
17. **Given** a suggestion the timetable refuses (double-booking), **when** I press Apply, **then** nothing changes, the card is removed, and the refusal reason is shown.
18. **Given** I dismiss a suggestion, **when** I return within 30 days, **then** it is not shown; after 30 days it returns if still valid.
19. **Given** a teacher removed from the workspace, **when** the balance view loads for the current week, **then** they are absent from it; **and when** last term's variance report loads, **then** their rows are present.
20. **Given** the variance CSV export and the on-screen table for the same range, **when** compared, **then** every number matches — both read the same view.
21. **Given** a deadline two hours away, **when** any countdown renders in this feature, **then** it says "today", not "tomorrow" — date arithmetic is in whole days in workspace time.
22. **Given** a teacher in school A, **when** an admin in school B queries `workload.school`, **then** zero rows are returned.
23. **Given** a teacher, **when** they call `workload.school` or `workload.suggestions`, **then** they get `FORBIDDEN` and RLS also blocks the underlying reads.
24. **Given** a teacher's own workload payload, **when** it is inspected, **then** it contains no `hourly_rate` field for anyone, including themselves.
25. **Given** an unlogged period from 12 days ago, **when** my workload loads, **then** it appears in the nudge list, oldest first, and tapping it opens the quick-log sheet pre-filled with that date and period.
26. **Given** a teacher who has never set `workload_sharing_prefs.share_variance`, **when** an admin queries `workload.school` or `workload.teacher`, **then** the response's `scheduled`, `coverHours`, `absences` and `band` fields are populated normally but `logged` and `variancePct` are absent (or `null`) with `shared: false`, and the band is unaffected because it was never computed from logged periods.
27. **Given** a teacher turns `share_variance` on, **when** an admin next queries their row, **then** `logged` and `variancePct` appear with `shared: true`; **given** the teacher later turns it off, **when** an admin queries again, **then** those fields are absent again — the toggle is live, not a one-time grant.
28. **Given** a mixed set of teachers where some have opted in and some have not, **when** the variance report is exported with `groupBy:'teacher'`, **then** only opted-in teachers appear as named rows, while the same period's `groupBy:'section_subject'` export still includes every section-subject's aggregate numbers in full.

## 10. Tests

- **Unit (`packages/domain`, ≥90 %):** `scheduledPeriods()`, `loggedPeriods()`, `variance()`, `band()` with window scaling, `coverHours()`, `rankCandidates()` (the whole §5.9 scoring table, including the tie-break determinism), `unloggedSlots()`, `weekBoundaries(timezone, workingDays)`.
- **DB (pgTAP):** cross-workspace isolation on all four views; a teacher cannot read another teacher's rows through the views; the views respect `workspace_members.status`; index-only plans for the two hot queries (asserted via `EXPLAIN`).
- **Integration:** `workload.school` against a seeded school of 25 teachers and a full term of timetable and logs, compared with hand-computed expectations; suggestion apply/refuse paths; settings validation and audit.
- **e2e (360×800 + 1280×800, axe):** J1 my workload week navigation and tap-to-log; J2 admin balance list → drawer → suggestion → apply; J3 thresholds preview and save; J4 variance export.
- **a11y:** period blocks are buttons with accessible names ("Sunday period 4, Class 8-B Mathematics, not logged"); band pills carry text, not just colour; the week navigator is keyboard-operable; axe clean on all five screens.
- **Performance budgets:** `workload.me` p95 < 200 ms; `workload.school` p95 < 600 ms for 100 teachers over a term; `workload.suggestions` p95 < 800 ms for 100 teachers; the variance CSV streams 10,000 rows without buffering the whole set in memory.

## 11. Open questions

1. **Does a period equal a period?** A 35-minute period and a 60-minute period both count as 1 here. `timetable_slots.duration_minutes` exists, so a minutes-based load is available. Default assumed: **count periods**, because that is how BD schools talk about load, and show minutes as a secondary figure.
2. **Non-teaching duties.** Exam invigilation, assembly duty and club supervision are real load and are not in the timetable. Default assumed: out of scope for v1; a future `duty_slots` table would feed the same views.
3. **Whose log counts?** §5.4 accepts a log either from `logged_by = user` or from the section-subject's primary teacher. If an assistant logs the lesson, both currently see it. Default assumed: attribute to the **section-subject's primary teacher** for load, and to `logged_by` for logging-discipline metrics. Needs confirming against how schools actually use assistants.
4. **Should suggestions consider preference or seniority?** A head of department may legitimately teach less. A `staff_records.target_periods_per_week` column would let the band compare against a personal target rather than one school-wide number. Default assumed: one school-wide threshold in v1, noted as the most likely v1.1 addition.
5. **Term-scaled thresholds** (§5.6). The scaling rule is proposed here; confirm with a real school before shipping, because a term with exam weeks has very different teaching density.
6. **Cover teacher overlap.** F-OP-08's candidate ranking and this feature's suggestion ranking share most of their eligibility logic. They should share one `packages/domain/eligibility.ts` module rather than diverge. Flagged for the ops-area author.
