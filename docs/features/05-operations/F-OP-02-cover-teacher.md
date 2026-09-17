# F-OP-02 — Cover Teacher

|                  |                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | ops                                                                                                                                                                                                                                              |
| Status           | planned                                                                                                                                                                                                                                          |
| Owner branch     | `feat/ops-cover-teacher`                                                                                                                                                                                                                         |
| Depends on       | F-AC-0x (timetable + periods + `section_subjects`), F-AC-0x (staff attendance + leave), F-OP-06 (`staff_records`, `staff_compensation`), F-OP-05 (notifications), F-OP-07 (`school_profiles.cover_policy`), F-OP-03 (monthly payroll-impact PDF) |
| Plan             | `docs/plan/ROADMAP.md` chunk TBD                                                                                                                                                                                                                 |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §1.2, §2.2 (`CoverAssignment`, `CoverTeacherConfig`, `PayrollImpactLog`), §3 rows 32–39, §4.3, §5 (Cover / payroll), §7.5, §7.13, §8 Q5–Q7                                                    |

---

## 1. Purpose

A teacher is absent. Four periods have no adult in the room, and the school has about fifteen minutes to fix it. **Cover Teacher** turns that scramble into one screen: the system already knows who is free at period 3, who teaches Physics, who has taken the most extra hours this month, and who the head of department listed as first choice for Class 9 – B Physics. It proposes a substitute per period, an admin confirms or overrides in one tap, the substitute gets a notification they can acknowledge on their phone, the day auto-closes at the last bell, and the extra hours land — as a **suggestion, never an automatic payment** — on a payroll-impact sheet an admin applies or ignores.

**What Base44 intended and what was fake.** The model was well specified (inventory §1.2, §4.3) and almost entirely unbuilt. `CoverAssignment` and `PayrollImpactLog` had **no creator anywhere in the codebase** (§7.5), so the whole surface was read/update-only over tables that could never hold a row. The priority list was written and displayed but **nothing ever read it** to choose a substitute (§5, "Cover priority resolution — NOT IMPLEMENTED"). There was no hourly-rate field on any entity, so the payroll figures it rendered (`{extra_hours}h × ৳{rate}/hr`) had no possible source and **the multiplication was never performed in code** (§5). `CoverTeacherConfig` stored a teacher's _display name_ into an FK column because `Class` had no teacher FK (§7.13). "Today's assignments" was computed in UTC, so a Dhaka school saw tomorrow's list from 06:00 (§5). The acknowledge step and the completion step had no code at all.

**Done looks like:** marking Ms. Nadia absent at 08:05 produces four ranked proposals by 08:06, the admin confirms all four with one tap, the substitutes acknowledge on their phones, the assignments close themselves at the last bell, and on the 1st of next month the principal opens a one-page PDF that says Mr. Rafiq covered 6.5 extra hours worth ৳3,250 — and decides.

## 2. Roles and permissions

| Action                          | Permission key                       | owner | admin | teacher | staff | parent | platform |
| ------------------------------- | ------------------------------------ | :---: | :---: | :-----: | :---: | :----: | :------: |
| View cover board                | `cover.view`                         |  ✅   |  ✅   |  own¹   | own¹  |   —    |   read   |
| Create manual cover assignment  | `cover.assign`                       |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Confirm / override a proposal   | `cover.assign`                       |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Acknowledge **own** assignment  | `cover.acknowledge`                  |  ✅   |  ✅   |   own   |  own  |   —    |    —     |
| Decline **own** assignment      | `cover.acknowledge`                  |  ✅   |  ✅   |   own   |  own  |   —    |    —     |
| Edit the priority list          | `cover.config.write`                 |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| Edit cover policy settings      | `settings.school.write`              |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| View payroll impact (amounts)   | `payroll_impact.view`                |  ✅   |  ✅   |  own²   | own²  |   —    |    —     |
| Apply / ignore a payroll impact | `payroll_impact.decide`              |  ✅   |  ✅   |    —    |   —   |   —    |    —     |
| View / edit hourly rates        | `staff.compensation.view` / `.write` |  ✅   |  ✅   |  own²   | own²  |   —    |    —     |

¹ A teacher sees only assignments where they are the cover teacher or the absent teacher.
² A teacher sees **their own** extra hours and their own credited amount, never anyone else's rate. `staff_compensation` is a separate table with an owner/admin-only policy (F-OP-06 §3); the engine reads rates through `app.staff_hourly_rate(user_id, on_date)` (SECURITY DEFINER) so the maths can run without exposing the table.

**Plan entitlement:** `cover_teacher` is a **Pro** module (PRODUCT-DECISIONS §5.1).

## 3. Data

> **Proposed; `docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table.

### 3.1 `cover_assignments`

| Column                                                            | Type                          | Notes                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `workspace_id`                                                    | uuid                          |                                                                                                        |
| `on_date`                                                         | date not null                 | the school day, in workspace timezone                                                                  |
| `absent_user_id`                                                  | uuid not null                 | the teacher who is out                                                                                 |
| `cover_user_id`                                                   | uuid                          | null while `unfilled`                                                                                  |
| `timetable_slot_id`                                               | uuid not null                 | **the real FK** — replaces Base44's `class_id + subject + section` strings                             |
| `section_id`, `section_subject_id`, `period_id`                   | uuid                          | denormalised from the slot for indexing and for history stability                                      |
| `trigger_reason`                                                  | enum `cover_trigger`          | `marked_absent \| on_leave \| missed_punch \| manual`                                                  |
| `triggered_at`                                                    | timestamptz                   |                                                                                                        |
| `status`                                                          | enum `cover_status`           | `proposed \| notified \| acknowledged \| declined \| completed \| overridden \| cancelled \| unfilled` |
| `proposed_user_id`                                                | uuid                          | the engine's top pick, kept even after an override (so we can measure the engine)                      |
| `rank_snapshot`                                                   | jsonb                         | the full ranked candidate list + component scores at proposal time — **explainability**                |
| `assigned_by`, `assigned_at`                                      |                               | the admin who confirmed                                                                                |
| `notified_at`, `acknowledged_at`, `declined_at`, `decline_reason` |                               |                                                                                                        |
| `overridden_by`, `overridden_at`, `override_reason`               | text not null when overridden |                                                                                                        |
| `completed_at`, `completed_by`                                    |                               | `completed_by = null` ⇒ auto-completed                                                                 |
| `duties_note`                                                     | text                          | "Ch. 7 exercises on the desk"                                                                          |
| `extra_minutes`                                                   | int                           | snapshot of the period length at assignment time                                                       |
| `idempotency_key`                                                 | text                          | `(workspace_id, on_date, absent_user_id, timetable_slot_id)`                                           |

Unique `(workspace_id, on_date, timetable_slot_id)` where `status not in ('cancelled','overridden')` — **one live cover per slot per day**.
Unique partial `(workspace_id, on_date, cover_user_id, period_id)` where `status in ('notified','acknowledged','completed')` — a substitute cannot be double-booked.
Indexes `(workspace_id, on_date, status)`, `(cover_user_id, on_date)`, `(absent_user_id, on_date)`.
RLS: owner/admin full; a member may `select` rows where they are `cover_user_id` or `absent_user_id`, and may `update` **only** `status → acknowledged|declined`, `acknowledged_at`, `declined_at`, `decline_reason` on rows where they are the `cover_user_id` (a column-scoped update policy plus a trigger that rejects any other column change).

### 3.2 `cover_priority_lists`

`(workspace_id, scope enum section_subject|section|subject|school, section_subject_id, section_id, subject_id, entries jsonb [{user_id, rank}], updated_by)`.
Base44 had one scope (class+subject) and stored a display string in the FK (§7.13). Four scopes let a school say "for Class 9 – B Physics use Karim then Nadia", "for anything in Class 3 – A use the class teacher", "for any Physics use the department head", and a school-wide fallback. **Resolution is most-specific-first** (§5.2).
Unique per scope key. RLS: owner/admin write; teachers read (they should know they are on a list).

### 3.3 `cover_payroll_impacts`

`(workspace_id, cover_assignment_id unique, period_month date (first of month), cover_user_id, absent_user_id, extra_hours numeric(6,2), hourly_rate_cover_paisa bigint, hourly_rate_absent_paisa bigint, cover_credit_paisa bigint, absent_deduction_paisa bigint, policy_snapshot jsonb, decision enum pending|applied|ignored default 'pending', decided_by, decided_at, decision_note, created_at)`.
Append-only in spirit: the only mutable columns are `decision`, `decided_by`, `decided_at`, `decision_note`, and a decision may be changed only by an owner with an audit event. Every rate is a **snapshot at completion time**, so a later raise never rewrites history.
Index `(workspace_id, period_month, decision)`, `(cover_user_id, period_month)`.
RLS: owner/admin full; a member may select rows where they are `cover_user_id` or `absent_user_id` **with the counterpart's rate column masked** (served through the view `my_cover_payroll_impacts`, not the base table).

### 3.4 Settings — `school_profiles.cover_policy` (jsonb)

```jsonc
{
  "enabled": true,
  "auto_assign": false, // false = propose only; true = assign the #1 candidate automatically
  "missed_punch_grace_minutes": 30,
  "missed_punch_enabled": true, // requires staff self check-in to be on
  "auto_complete_offset_minutes": 60, // after the last period's end time
  "monthly_extra_hours_cap": 20,
  "allow_over_cap": false,
  "same_day_max_cover_periods": 3,
  "credit_cover": true, // pay the substitute
  "unpaid_absence": false, // deduct from the absent teacher — DEFAULT OFF
  "unpaid_absence_factor": 1.0,
  "decline_window_minutes": 20, // after which an unacknowledged assignment is re-proposed
  "ranking": {
    "priority_base": 100,
    "priority_step": 20,
    "priority_floor": 40,
    "subject_same_subject": 30,
    "subject_same_section_subject": 40,
    "load_points_max": 20,
    "same_day_penalty": 5,
    "free_period_required": true,
  },
}
```

Edited at `/app/settings/cover` (F-OP-07). Every weight is a setting because every school argues about them; the **defaults above are what ships**.

### 3.5 Tables read (owned elsewhere)

`timetable_slots`, `periods` (`start_time`, `end_time`, `day_of_week`), `sections`, `section_subjects` (primary + assistant teachers), `subjects`, `staff_attendance` (+`leave_requests`), `staff_records`, `staff_compensation`, `workspace_members`, `school_profiles` (`timezone`, `working_days`, `holidays`), `notifications`, `jobs`, `audit_events`.

## 4. Workflows

### W1 — Trigger (a): marked absent / on leave

Trigger: a `staff_attendance` row for user T on date D is written or updated to `absent`, or an approved `leave_requests` range covers D.

1. A DB trigger enqueues `jobs{type:'cover.plan', payload:{workspace_id, user_id: T, on_date: D}}` (idempotent on that triple).
2. The job runner loads every `timetable_slots` row for T on D (respecting `working_days` and the holiday calendar — a holiday produces nothing), skips periods already past **more than 10 minutes** ago, and for each remaining slot runs the ranking engine (§5.3).
3. Outcome: one `cover_assignments` row per slot, `status='proposed'`, `proposed_user_id` = rank 1, `rank_snapshot` = the full scored list. If no candidate qualifies → `status='unfilled'`.
4. Notification `cover.proposals_ready` to owner+admin with a deep link and the count ("4 periods need cover today").
5. If `cover_policy.auto_assign = true`, the job immediately performs W3 step 2 for rank 1 and skips the admin.
   Failures: T has no timetable that day → the job exits and writes nothing (no empty cards); the absence is reversed later → W6.

### W2 — Trigger (b): missed punch

Trigger: a pg_cron job runs every 5 minutes on working days between the first period's start and the fourth period's end.

1. For each workspace with `missed_punch_enabled` **and** staff self check-in enabled: find users with ≥1 timetable slot today, no `staff_attendance` record for today, no check-in punch, and whose **first slot of the day started at least `missed_punch_grace_minutes` ago** (default 30).
2. Enqueue `cover.plan` with `trigger_reason='missed_punch'`. Fires **at most once per user per day** (unique index on `(workspace_id, on_date, absent_user_id, trigger_reason)` in a `cover_trigger_log` guard table).
3. Only the **remaining** slots of the day are covered; the already-missed period gets an `unfilled` row for the record, marked `too_late`.
4. Outcome: same as W1, plus a distinct notification wording ("Ms. Nadia has not checked in — 3 periods may need cover").
   Failures: the teacher checks in at 08:50 → W6 cancels every proposed/notified row for them with `status='cancelled'`, reason `teacher_present`, and notifies anyone already assigned.

### W3 — Assign, notify, acknowledge

Trigger: admin opens `/app/cover` (today).

1. **Phone (360):** a list of period cards, each showing period, class, subject, the absent teacher, and the proposed substitute with a one-line reason chip ("Free · Teaches Physics · 2 h this month"). Primary action **Confirm** is a 44 px full-width button in the thumb zone. **Confirm all** sits in a sticky bottom bar with the count. **Desktop (≥1024):** a period × class grid for the day with the same cards inline and a right panel for the candidate list.
2. Tapping the substitute's name opens the **candidate sheet**: the ranked list with each candidate's score broken into its four components (this is `rank_snapshot`, rendered — the engine is never a black box). Picking anyone else is an **override** and requires nothing extra at proposal stage (the row was never live); picking someone _after_ a substitute was notified requires a reason (W5).
3. Confirm → `status='notified'`, `cover_user_id`, `assigned_by`, `assigned_at`, `notified_at`; notification `cover.assigned` to the substitute (in-app + push + email if their preferences ask) carrying period, class, subject, room, and the absent teacher's `duties_note`.
4. The substitute opens the notification → a sheet with **Acknowledge** / **Can't do it**. Acknowledge → `status='acknowledged'`. Decline → `status='declined'` + reason, the slot returns to the board as `proposed` with the declined user excluded from the new ranking, and the admin is notified.
5. If nobody acknowledges within `decline_window_minutes` (default 20), a job re-proposes the next candidate and nudges the admin. The original row stays `notified` until reassigned, so nothing silently disappears.
   Failures: the chosen substitute is now double-booked (raced) → unique index rejects, the UI refetches and shows why; assigning to someone over the monthly cap with `allow_over_cap=false` → blocked with a message naming their hours.

### W4 — Auto-complete

Trigger: a job at **last period's `end_time` + `auto_complete_offset_minutes`** (default 60), per workspace, in workspace timezone.

1. Every `notified` or `acknowledged` assignment for today → `status='completed'`, `completed_at=now()`, `completed_by=null`.
2. Rows that were never acknowledged are completed too but flagged in reports (`acknowledged_at is null`) — the school needs to know the substitute never confirmed.
3. For each completed row the job creates the `cover_payroll_impacts` row (§5.5) **if `credit_cover` or `unpaid_absence` is on**.
4. `proposed` and `unfilled` rows at end of day → `status='unfilled'` with `unfilled_reason` (`no_candidate` / `not_confirmed`), and they appear in the monthly report as gaps. **This is the number that tells a school to hire.**
   Failures: the job misses a run → the next run backfills any day within the last 7 days (the query is date-bounded, not "today"-bounded).

### W5 — Override

Trigger: the absent teacher turns up, or the admin wants a different person after notification.

1. **Override** on an assignment card opens a sheet: pick _Teacher was present_ / _Different substitute_ / _Class cancelled_, plus a **mandatory written reason**.
2. _Teacher was present_ → `status='overridden'`, the substitute is notified ("Cover cancelled — Ms. Nadia is in"), no payroll impact is created (or an existing pending one is voided with `decision='ignored'`, note `overridden`).
3. _Different substitute_ → the current row is `overridden`, a new row is created for the same slot with the new person, and both are linked by `rank_snapshot.replaces`.
4. Every override writes `audit_events` **with the reason intact** — Base44 discarded exactly this field through a wrong-argument-order call (§7.1).

### W6 — Reversal

Trigger: attendance for T on D changes from `absent` to `present`, or leave is cancelled.
All `proposed` rows for T on D are deleted; all `notified`/`acknowledged` rows become `cancelled` with reason `absence_reversed`; substitutes are notified; any `pending` payroll impact is voided. Completed rows are **not** touched (the cover happened).

### W7 — Payroll impact review

Trigger: admin opens `/app/cover/payroll` (or the Cover tab's _Payroll_ segment).

1. Grouped by month, then by teacher. Each row: teacher, extra hours, rate, credit, and — if `unpaid_absence` is on — the absent-side deduction, with a link to the assignment that produced it.
2. Two actions per row and per selection: **Apply** (mark as taken into the school's payroll run) and **Ignore**, both requiring nothing but recording `decided_by`/`decided_at`; an optional note. **Nothing is ever applied automatically** — Base44's UI copy promised this and we keep the promise, but this time the promise is enforced by there being no code path that sets `applied` without an actor.
3. **Export**: the monthly payroll-impact PDF (F-OP-03 renderer) and a CSV with one row per assignment.
   Failures: a rate is missing for a teacher → the impact row is created with `hourly_rate_cover_paisa = null`, `cover_credit_paisa = null`, `decision='pending'` and a visible **"Rate not set"** chip linking to the staff record. Silence is not an option.

### W8 — Priority lists

Trigger: admin opens `/app/cover/config`.
Per section-subject (or section / subject / school), drag up to **5** teachers into an ordered list; a "— clear —" option that is a real menu item with a real value (Base44 crashed Radix with `value={null}`, §7.9). Saving writes `cover_priority_lists`. Teachers on a list see it read-only on their own profile.

## 5. Business rules and calculations

### 5.1 Eligibility (hard filters — applied before scoring)

A member C is a candidate for slot S (period `p`, date `D`, section-subject `ss`) iff **all** hold:

1. `workspace_members`: `status='active'` and `role in ('teacher','admin','owner')` (a `staff` member may be included when `cover_policy.ranking.allow_staff` is on; default off).
2. `C != absent_user_id`.
3. C has **no `timetable_slots` row** at `(D's weekday, p)` — the "free period" rule. (If `ranking.free_period_required` is false, a busy teacher may appear, scored 0 on priority and flagged; default true.)
4. C has no `staff_attendance` of `absent`/`on_leave` for D and no approved leave covering D.
5. C has no other live `cover_assignments` at `(D, p)`.
6. C's cover periods already assigned for D `< same_day_max_cover_periods` (default 3).
7. `extra_hours_month(C) < monthly_extra_hours_cap` **unless** `allow_over_cap` (default false).
8. C has not declined this exact slot today.

### 5.2 Priority-list resolution

The list used for slot S is the **most specific** one that exists, in this order:
`section_subject` → `section` → `subject` → `school`. Exactly one list is used; lists are **not** merged (merging produced unexplainable orders in testing of the rule). If no list exists, priority points are 0 for everyone and the other three components decide.

### 5.3 Ranking score

Pure function `rankCoverCandidates(slot, candidates, policy, stats)` in `packages/domain/cover/ranking.ts`. Score is an integer 0–190 with the shipped defaults.

```
score(C) = priority_points(C) + subject_points(C) + load_points(C) − same_day_penalty(C)
```

**Priority points** — from the resolved list, `rank` is 1-based:

```
priority_points = C in list
  ? max(priority_floor, priority_base − (rank − 1) × priority_step)   // 100, 80, 60, 40, 40 …
  : 0
```

Defaults `priority_base=100`, `priority_step=20`, `priority_floor=40`.

**Subject points** — take the **maximum**, never the sum:

```
subject_points =
   40  if C is a teacher (primary or assistant) on this exact section_subject
   30  else if C teaches this subject on any section this academic year
    0  otherwise
```

**Load points** — rewards the teacher with the fewest extra hours this month:

```
load_points = round( load_points_max × (1 − extra_hours_month(C) / monthly_extra_hours_cap) )
              clamped to [0, load_points_max]
```

`load_points_max=20`, `monthly_extra_hours_cap=20`. So 0 h → 20 points, 10 h → 10 points, ≥20 h → 0 points.

**Same-day penalty**:

```
same_day_penalty = same_day_penalty_points × (cover periods already assigned to C on D)   // 5 each
```

**Tie-break**, applied in order, all deterministic:

1. fewer scheduled teaching periods on D;
2. lower `extra_hours_month`;
3. fewer cover assignments in the last 7 days;
4. `staff_records.staff_code` ascending (stable, never random).

The engine returns the full ranked list with each component, and that list is stored verbatim in `rank_snapshot`. Every proposal in the UI is therefore explainable in one sentence.

### 5.4 Extra hours

```
extra_minutes(assignment) = periods.end_time − periods.start_time       // for the slot's period, in minutes
extra_hours(assignment)   = round(extra_minutes / 60, 2)
```

`extra_minutes` is **snapshotted onto the assignment** at assignment time, so editing the bell schedule next term never rewrites last term's payroll.

```
extra_hours_month(C) = Σ extra_hours over cover_assignments
                       where cover_user_id = C
                         and status = 'completed'
                         and on_date between month_start and month_end   // workspace timezone
```

Only `completed` assignments count. Proposed, notified, declined, cancelled and overridden ones do not.

### 5.5 Payroll impact

Created by the auto-complete job (W4), one row per completed assignment.

```
hourly_rate_cover_paisa  = app.staff_hourly_rate(cover_user_id,  on_date)   // snapshot
hourly_rate_absent_paisa = app.staff_hourly_rate(absent_user_id, on_date)   // snapshot

cover_credit_paisa =
   credit_cover ? round_half_up(extra_hours × hourly_rate_cover_paisa) : 0

absent_deduction_paisa =
   (unpaid_absence AND absence_is_unpaid)
     ? round_half_up(extra_hours × hourly_rate_absent_paisa × unpaid_absence_factor)
     : 0
```

`absence_is_unpaid` is true when the day's `staff_attendance.status='absent'` with no approved leave, or the approved `leave_requests.leave_type` is marked unpaid. **`unpaid_absence` ships OFF** (PRODUCT-DECISIONS §6.3): by default a substitute is credited and the absent teacher is not docked.
All money is `bigint` paisa; `round_half_up` to whole paisa; display divides by 100 with `৳` and `en-BD` grouping. A null rate yields a null amount and a `rate_missing` flag — never `0`, never a guess.

### 5.6 Monthly payroll-impact report

Per `period_month`, per teacher:

```
extra_hours_total   = Σ extra_hours (completed assignments in the month)
credit_total        = Σ cover_credit_paisa
deduction_total     = Σ absent_deduction_paisa
net                 = credit_total − deduction_total
applied / pending / ignored = counts and sums by decision
```

School-level footer: total extra hours, total credit, **unfilled period count** and **unacknowledged count** (the two operational numbers). Rendered by F-OP-03 (`kind='cover_payroll_monthly'`) with the school header from `school_profiles`; CSV export carries one row per assignment with the full audit columns.

### 5.7 Time and dates

Every "today", month boundary, period comparison and cron window uses `school_profiles.timezone` (default `Asia/Dhaka`) computed in SQL (`(now() at time zone tz)::date`). Holidays and non-working days produce no assignments. The UTC-`toISOString()` pattern that shifted Base44's list at 06:00 local (§5) is banned by a lint rule.

## 6. UI

| Screen          | Route                     | 360×800                                                                                                         | ≥1024                                                                   | Primary action | Empty / loading / error                                                                  |
| --------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Cover today     | `/app/cover`              | Date chip row (Yesterday·Today·Tomorrow + picker); vertical period cards; sticky bottom bar **Confirm all (4)** | Day grid: periods × classes, cards inline; right panel = candidate list | Confirm        | Empty: "No absences today 🎉 — everyone is in" · Skeleton period cards · Banner retry    |
| Candidate sheet | (sheet over `/app/cover`) | Bottom sheet, ranked list, each row shows score chips (Priority 80 · Subject 30 · Load 18)                      | Right panel, same content                                               | Assign         | "No one is free at period 3" + _Assign anyway_ toggle that relaxes rule 3 with a warning |
| My cover        | `/app/cover/mine`         | List of my assignments; each has Acknowledge / Can't do it                                                      | Same, wider                                                             | Acknowledge    | "You have no cover duties"                                                               |
| Override sheet  | —                         | Bottom sheet, reason radio group + required text                                                                | Dialog                                                                  | Override       | Reason-required validation                                                               |
| Priority lists  | `/app/cover/config`       | Scope picker → searchable teacher list → tap to add → drag handles to reorder                                   | Two-pane: scopes left, editor right                                     | Save           | "No list yet — the engine will use free periods and subject match"                       |
| Payroll impact  | `/app/cover/payroll`      | Month chip row; teacher cards with hours + amount; per-card Apply/Ignore; multi-select via long-press           | Table with bulk select, totals row                                      | Apply          | "Nothing to review" · "Rate not set" chips linking to staff records                      |
| Cover policy    | `/app/settings/cover`     | Grouped form, each setting with its default shown                                                               | Two-column                                                              | Save           | —                                                                                        |

Components: `AppShell`, `DataList`, `FormSheet`, `ConfirmSheet`, `ScoreChips` (new, in `packages/ui`), `PersonRow`, `MoneyText` (paisa → ৳, single implementation), `EmptyState`, `StickyActionBar`.
One-thumb rule: on `/app/cover` the only actions above the fold are Confirm and the candidate sheet trigger; everything else (override, history, config) is behind a card overflow menu.

## 7. Server contracts

| Name                                       | Input                                            | Output                                    | Errors                                                         | Idempotency                  | Rate limit |
| ------------------------------------------ | ------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------- | ---------------------------- | ---------- |
| `planCover` (job handler, not user-facing) | `{ workspaceId, userId, onDate, triggerReason }` | `{ created: n, unfilled: m }`             | `no_timetable`, `holiday`                                      | key `(ws,user,date,reason)`  | —          |
| `createManualCover`                        | `{ onDate, absentUserId, timetableSlotIds[] }`   | `CoverAssignment[]`                       | `slot_not_found`, `duplicate_slot`                             | client draft id              | 60/h       |
| `assignCover`                              | `{ assignmentId, coverUserId, overrideReason? }` | `CoverAssignment`                         | `double_booked`, `over_cap`, `not_eligible`, `reason_required` | per assignment + user        | 300/h      |
| `confirmAllProposals`                      | `{ onDate, absentUserId? }`                      | `{ assigned: n, skipped: [{id,reason}] }` | partial success is normal                                      | key `(ws,date,actor,minute)` | 60/h       |
| `acknowledgeCover`                         | `{ assignmentId }`                               | `CoverAssignment`                         | `forbidden`, `wrong_status`                                    | natural                      | 120/h      |
| `declineCover`                             | `{ assignmentId, reason }`                       | `CoverAssignment`                         | `reason_required`                                              | natural                      | 60/h       |
| `overrideCover`                            | `{ assignmentId, kind, reason }`                 | `CoverAssignment`                         | `reason_required`                                              | per assignment               | 120/h      |
| `completeCover` (manual)                   | `{ assignmentId }`                               | `CoverAssignment`                         |                                                                |                              |            |
| `autoCompleteDay` (cron)                   | `{ workspaceId, onDate }`                        | `{ completed, unfilled, impacts }`        |                                                                | key `(ws,date)`              | —          |
| `savePriorityList`                         | `{ scope, scopeId, userIds[] }`                  | `CoverPriorityList`                       | `too_many_entries` (>5), `not_a_member`                        |                              | 120/h      |
| `decidePayrollImpact`                      | `{ impactIds[], decision, note? }`               | `{ updated: n }`                          | `forbidden`, `already_decided`                                 | per impact + decision        | 120/h      |
| `GET /api/reports/cover-payroll`           | `{ month }`                                      | enqueues a `report_runs` row (F-OP-03)    | `plan_required`                                                |                              | 20/h       |

`planCover`, `autoCompleteDay` and the missed-punch sweeper run through the `jobs` table / pg_cron with `withServiceRole('cover.engine')`; every service-role use logs its reason (ARCHITECTURE §3).

## 8. Parts (build chunks)

**Part 1 — Schema, RLS, policy settings** · `cover_assignments`, `cover_priority_lists`, `cover_payroll_impacts`, `cover_trigger_log`, enums, unique indexes (single live cover per slot; no double-booking), the column-scoped acknowledge policy + guard trigger, `app.staff_hourly_rate`, `cover_policy` defaults in `school_profiles`.
_Demo:_ pgTAP shows a teacher can flip their own assignment to `acknowledged` and **cannot** change `cover_user_id`, and cannot see another teacher's assignment.

**Part 2 — Ranking engine (pure domain)** · `rankCoverCandidates` with eligibility filters, four score components, priority-list resolution order, tie-breaks, and the `rank_snapshot` shape; ≥95 % branch coverage.
_Demo:_ `pnpm test packages/domain/cover` prints a table-driven fixture where the expected order for 8 candidates matches, and each component is asserted independently.

**Part 3 — Trigger (a) + proposal generation** · DB trigger on `staff_attendance`/`leave_requests` → `jobs`; the `cover.plan` handler; holiday/working-day skipping; `unfilled` when no candidate; the reversal path (W6).
_Demo:_ mark a teacher absent in the seed school and watch four `proposed` rows with populated `rank_snapshot` appear within one cron tick.

**Part 4 — Cover board: assign, notify, acknowledge, decline** · phone list + desktop day grid, candidate sheet with score chips, Confirm / Confirm-all, notification fan-out, `/app/cover/mine` with acknowledge/decline, the 20-minute re-propose job.
_Demo:_ at 360×800 an admin confirms all four, the substitute (second browser context) acknowledges from a notification, and the board turns green.

**Part 5 — Override, manual trigger, priority lists** · override sheet with mandatory reason + audit, manual cover creation from the timetable, the four-scope priority list editor with drag ordering.
_Demo:_ override with "teacher arrived", see the substitute notified and the reason present in `audit_events`; reorder a priority list and watch the next proposal change accordingly.

**Part 6 — Missed-punch trigger + auto-complete** · the 5-minute sweeper with grace window and once-per-day guard, the end-of-day auto-complete job with 7-day backfill, `too_late` and `unfilled_reason` handling.
_Demo:_ with grace set to 1 minute in the dev branch, skipping check-in produces proposals for the remaining periods only; after the simulated last bell, everything auto-completes.

**Part 7 — Payroll impact + monthly report** · impact creation on completion with rate snapshots, `rate_missing` handling, the review screen with Apply/Ignore (bulk), the `my_cover_payroll_impacts` masked view, the monthly PDF via F-OP-03 and the CSV export.
_Demo:_ a completed 45-minute cover at ৳400/h produces `extra_hours = 0.75` and `cover_credit_paisa = 30000` (৳300.00); Apply records the actor; the month PDF totals match the CSV.

## 9. Acceptance criteria

**Triggers**

1. _Given_ a teacher with 4 timetable periods today, _when_ an admin marks them absent, _then_ within one cron tick 4 `cover_assignments` rows exist with `status='proposed'` and a non-empty `rank_snapshot`.
2. _Given_ a teacher with no timetable today, _when_ they are marked absent, _then_ no cover assignment is created.
3. _Given_ today is a holiday in `school_profiles`, _when_ a teacher is marked absent, _then_ no cover assignment is created.
4. _Given_ `missed_punch_grace_minutes = 30` and self check-in enabled, _when_ a teacher's first period started 31 minutes ago with no punch and no attendance record, _then_ assignments are created for the **remaining** periods only and the already-started period is `unfilled` with reason `too_late`.
5. _Given_ that same teacher then checks in, _when_ the next sweep runs, _then_ all `proposed`/`notified` rows for them today become `cancelled` with reason `teacher_present` and any notified substitute is notified of the cancellation.
6. _Given_ a missed-punch trigger already fired for a teacher today, _when_ the sweeper runs again, _then_ no second set of assignments is created.

**Ranking** 7. _Given_ candidates A (priority rank 1, teaches the subject, 0 h this month) and B (not on the list, teaches the subject, 0 h), _then_ A scores 100+30+20 = 150 and B scores 0+30+20 = 50, and A is proposed. 8. _Given_ a candidate with 10 h of the 20 h monthly cap, _then_ their load points are 10. 9. _Given_ a candidate at 20 h with `allow_over_cap=false`, _then_ they are excluded from the candidate list entirely. 10. _Given_ a candidate who teaches the exact section-subject **and** the subject generally, _then_ subject points are 40, not 70. 11. _Given_ a candidate with a timetable period at that slot, _then_ they are excluded while `free_period_required = true`. 12. _Given_ two candidates with identical scores, _when_ the list is generated twice, _then_ the order is identical both times (deterministic tie-break). 13. _Given_ both a section-subject list and a school list exist, _then_ only the section-subject list contributes priority points.

**Assignment lifecycle** 14. _Given_ a proposal, _when_ an admin confirms, _then_ `status='notified'`, `assigned_by` is the admin, and the substitute receives a notification containing period, class, subject and the duties note. 15. _Given_ a notified assignment, _when_ the substitute taps Acknowledge on a 360×800 screen, _then_ `status='acknowledged'` and `acknowledged_at` is set. 16. _Given_ a notified assignment, _when_ the substitute declines with a reason, _then_ the slot returns to `proposed` with that person excluded from the new ranking. 17. _Given_ a substitute already assigned at period 3, _when_ an admin tries to assign them to another class at period 3, _then_ the request fails with `double_booked` and no row is written. 18. _Given_ a notified assignment, _when_ an admin overrides without a reason, _then_ the server returns `reason_required`. 19. _Given_ an override with the reason "teacher arrived at 9:10", _then_ an `audit_events` row exists containing that exact text.

**Completion and payroll** 20. _Given_ an acknowledged assignment for a 45-minute period, _when_ the auto-complete job runs after the last bell + 60 min, _then_ `status='completed'`, `completed_by is null`, and `extra_hours = 0.75`. 21. _Given_ `credit_cover=true` and the substitute's rate is ৳400/h, _then_ `cover_credit_paisa = 30000` and `decision='pending'`. 22. _Given_ `unpaid_absence=false` (default), _then_ `absent_deduction_paisa = 0` for every impact. 23. _Given_ `unpaid_absence=true`, factor 1.0, an unexcused absence and the absent teacher's rate ৳500/h, _then_ `absent_deduction_paisa = 37500`. 24. _Given_ a substitute with no rate set, _then_ the impact row exists with null amounts, a `rate_missing` flag, and the UI shows "Rate not set" linked to the staff record. 25. _Given_ a pending impact, _when_ an admin taps Apply, _then_ `decision='applied'`, `decided_by` and `decided_at` are recorded — and _given_ no admin acts, _then_ it stays `pending` forever; **no code path sets `applied` without an actor**. 26. _Given_ the substitute's rate is raised next month, _when_ last month's report is regenerated, _then_ the amounts are unchanged (snapshot). 27. _Given_ a month with 3 unfilled periods, _when_ the monthly report renders, _then_ the footer shows "3 periods went uncovered" and the school header comes from `school_profiles`.

**Visibility** 28. _Given_ a teacher, _when_ they open the payroll screen, _then_ they see their own hours and credit and **no other teacher's rate or amount** (pgTAP on `my_cover_payroll_impacts`). 29. _Given_ an admin of School A, _when_ they query `cover_assignments` with their JWT, _then_ zero School B rows are returned. 30. _Given_ a Bangladesh workspace at 06:30 local, _when_ the board loads "Today", _then_ it shows the current local date, not the next UTC date.

## 10. Tests

- **Unit (`packages/domain/cover`, ≥ 90 %)**: eligibility filters (8 rules × pass/fail), each score component in isolation, the composite score, priority-list resolution precedence, tie-break determinism (property test: shuffling the input never changes the output order), `extra_hours` rounding at 40/45/50/60-minute periods, `cover_credit_paisa` half-up rounding at `.005` boundaries, `extra_hours_month` window boundaries across a month edge in Asia/Dhaka.
- **DB (pgTAP)**: cross-tenant isolation on all three tables; the acknowledge policy (teacher can set `acknowledged`, cannot set `cover_user_id`, cannot touch another's row); the two unique indexes under concurrent inserts; `app.staff_hourly_rate` returns null (not an error) for a teacher without compensation and cannot be used to read the table directly.
- **Integration**: the trigger→job→proposal chain; reversal cancelling live rows; auto-complete backfill over a 3-day gap; `confirmAllProposals` partial success shape; idempotency of `planCover` on a duplicate job row.
- **e2e (both viewports, axe)**: J1 mark absent → proposals → confirm all → substitute acknowledges → auto-complete → payroll impact appears; J2 missed punch with a 1-minute grace → proposals → teacher checks in → cancellations; J3 override with reason → audit visible; J4 priority list reorder changes the next proposal; J5 monthly PDF download and totals match the CSV.
- **a11y**: the candidate sheet is a listbox with names and score chips read as one label; drag reordering has a keyboard alternative (move up / move down buttons); the Confirm-all bar is reachable by tab and announces the count.
- **Performance budgets**: `planCover` for a teacher with 8 periods and 60 candidate teachers ≤ 300 ms server time; the day board ≤ 800 ms p95; the monthly report query ≤ 500 ms at 2,000 assignments.

## 11. Open questions

1. **Does a cover period count toward the substitute's own workload reports?** _Default assumed:_ yes for "logged periods" in the workload view (F-TI-0x §3.8) and yes for extra hours, with a separate `cover` badge so the variance chart can distinguish them.
2. **Half-day absences.** _Default assumed:_ the trigger covers only the periods that fall inside the absent window; `staff_attendance.status='half_day'` must carry which half. If it does not, we cover the whole day and the admin cancels the periods the teacher actually taught.
3. **Cross-workspace substitutes** (a teacher who is a member of two schools) are out of scope; each workspace ranks only its own members.
4. **Is `staff` allowed to cover?** _Default assumed:_ no (`ranking.allow_staff=false`), because a lab assistant covering a maths class is a policy decision, not a default.
5. **Rate source of truth.** This spec assumes `staff_compensation.hourly_rate_paisa` with `effective_from` versioning (F-OP-06 §3). If DATA-MODEL.md puts `hourly_rate` directly on `staff_records`, `app.staff_hourly_rate` still works but loses the historical snapshot guarantee — flagged to the data-model agent.
6. **Auto-assign default.** Ships **off**. Schools that want it on get it as one switch; we do not make a machine assign a human's Tuesday without a person saying yes first.
