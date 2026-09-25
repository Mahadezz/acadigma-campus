# F-AC-11 — School calendar (holidays, events, working-day overrides)

|                  |                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                                                                                                                                                                                                                                                         |
| Status           | in-progress — **Part 1 demo cut (PR #43, D-202):** `holidays`, `working_day_overrides`, `app.is_school_day` / `school_days` / `school_day_count` (pgTAP `41_school_calendar.sql`), holidays screen at `/app/settings/calendar`. Left from Part 1: `holiday_scopes` + section argument, `academic_year_id`, TS mirror + parity test, `GET /api/calendar/school-days`, override UI. |
| Owner branch     | `feat/academics-calendar`                                                                                                                                                                                                                                                                                                                                                         |
| Depends on       | F-AC-01 (academic years, terms, sections), F-AU-04 (school profile: `working_days`, `timezone`)                                                                                                                                                                                                                                                                                   |
| Consumed by      | F-AC-03 (attendance denominators), F-AC-04 (leave day counts), F-AC-05 (timetable + ICS EXDATEs), F-AC-06 (exam dates), F-AC-07 (due dates), F-AC-09 (analytics gaps), F-AC-10 (parent calendar)                                                                                                                                                                                  |
| Plan             | `docs/plan/ROADMAP.md` chunk 4 (it must land before attendance reporting)                                                                                                                                                                                                                                                                                                         |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §3 features 44–46, §6 items 31, 36, §7 Q5                                                                                                                                                                                                                                                                                   |

## 1. Purpose

The calendar is the small feature that half the product silently depends on. It answers one question — **"is this a school day, and if so what is happening?"** — for attendance percentages, leave day counts, timetable expansion, exam scheduling, homework due dates, analytics charts and the parent portal. It holds **holidays** (Eid, Victory Day, Durga Puja, the school's own founder's day), **events** (sports day, parents' meeting, admission test), **exam dates** projected from F-AC-06, and **working-day overrides** (a Friday made into a school day to make up for a flood closure). "Done": an admin seeds the Bangladesh public holidays for the year in one tap, adds the school's own dates, and from then on no screen anywhere in the product ever asks a teacher to take attendance on Eid or plots a holiday as 0 % attendance.

**Base44 intent vs reality.** The Master Calendar page's own subtitle promised "all exams, assignments **and schedules**" — it rendered exams and assignment due dates only. `EVENT_COLORS.schedule` was defined at `MasterCalendar.jsx:14` and **never used**; there was no timetable layer and **no holiday entity existed at all**. The month grid hardcoded a Saturday start, ignoring `school.first_day_of_week`, and the route had **no role guard**, so any authenticated user including a parent could open it. Because there were no holidays, the analytics daily-attendance chart plotted every non-school day as **0 %** rather than as a gap, and `SchoolSettings.work_week_days` — a real setting collected in two places — was **read nowhere**. PRODUCT-DECISIONS 2.5 fixes the week (Sat–Thu default, Asia/Dhaka) and 6.10 fixes the "today" bug; this feature supplies the day-level truth both of them imply.

## 2. Roles and permissions

| Action                                      | Permission key            | owner | admin | teacher                                 | staff | parent                                           | platform |
| ------------------------------------------- | ------------------------- | ----- | ----- | --------------------------------------- | ----- | ------------------------------------------------ | -------- |
| View the school calendar                    | `calendar.read`           | yes   | yes   | yes                                     | yes   | own children's school + section events (F-AC-10) | no       |
| Create/edit/delete a holiday                | `calendar.holiday.write`  | yes   | yes   | no                                      | no    | no                                               | no       |
| Create/edit/delete an event                 | `calendar.event.write`    | yes   | yes   | class teacher (own section events only) | no    | no                                               | no       |
| Create a working-day override               | `calendar.override.write` | yes   | yes   | no                                      | no    | no                                               | no       |
| Seed public holidays for a year             | `calendar.seed`           | yes   | yes   | no                                      | no    | no                                               | no       |
| Publish a calendar (make it parent-visible) | `calendar.publish`        | yes   | yes   | no                                      | no    | no                                               | no       |
| Export ICS / print the year planner         | `calendar.export`         | yes   | yes   | yes                                     | yes   | own children                                     | no       |

A class teacher can add an event scoped to their own section ("Class 6 – A field trip") but cannot declare a holiday — closing the school is an admin decision with product-wide consequences.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table.

**Ownership.** `holidays` is **owned by this feature** — its migration, RLS, constraints and server actions live here. F-OP-07 specifies only the _settings screen_ that edits it and calls the actions in §7. (`academic_years` and `terms` are owned by F-AC-01; `grade_scales` by F-AC-06.)

**`holidays`** — days the school is closed: `academic_year_id`, `name text` ("Eid-ul-Fitr"), `name_bn text null`, `starts_on date`, `ends_on date` (inclusive; a single day has `starts_on = ends_on`), `kind holiday_kind` (`public|religious|national|school|vacation|weather|emergency`), `is_recurring bool default false`, `recurrence_rule text null` (for fixed-date annuals such as 16 December), `applies_to_all bool default true`, `source holiday_source` (`seed|manual|import`), `note text null`, `created_by`.
Indexes: `index (workspace_id, academic_year_id, starts_on)`, GiST `index (workspace_id, daterange(starts_on, ends_on, '[]'))` for fast range containment. Checks: `ends_on >= starts_on`; the range must fall inside its academic year.

**`holiday_scopes`** — the rare partial closure (only the primary wing, only Class 11–12 during board exams): `holiday_id`, `grade_level_id null`, `section_id null`.
Index: `index (workspace_id, holiday_id)`. When a holiday has no scope rows and `applies_to_all` is true, it applies school-wide.

**`calendar_events`** — things that happen on a school day: `academic_year_id`, `term_id null`, `title text`, `description text null`, `kind event_kind` (`event|meeting|sports|cultural|exam|admission|ptm|trip|training|deadline|other`), `starts_on date`, `ends_on date`, `starts_at time null`, `ends_at time null`, `all_day bool default true`, `location text null`, `room_id null`, `audience event_audience` (`school|staff|students|parents|section`), `section_id null`, `grade_level_id null`, `parent_visible bool default true`, `cancels_classes bool default false`, `colour text`, `source event_source` (`manual|exam|system`), `source_ref_id uuid null` (the `exams.id` when projected from F-AC-06), `published bool default true`, `created_by`.
Indexes: `index (workspace_id, starts_on)`, `index (workspace_id, section_id, starts_on)`, `index (workspace_id, source, source_ref_id)`.

**`working_day_overrides`** — the escape hatch that makes the rest of the product correct: `academic_year_id`, `date date`, `is_working bool`, `reason text`, `bell_schedule_id uuid null` (a make-up day may run a short bell schedule), `created_by`.
Index: `unique (workspace_id, date)`. `is_working = true` on a normal weekend turns it into a school day; `is_working = false` behaves like a one-day holiday with a reason.

**Enums**: `holiday_kind`, `holiday_source`, `event_kind`, `event_audience`, `event_source`.

**The one function everything else calls.**

```sql
app.is_school_day(workspace_id uuid, d date, section_id uuid default null) returns boolean
app.school_days(workspace_id uuid, from_d date, to_d date, section_id uuid default null) returns setof date
```

`STABLE`, `SECURITY DEFINER`, `search_path` pinned. `school_days` is the denominator behind attendance reports (F-AC-03 §5.6), leave day counts (F-AC-04 §5.4), the analytics gap rule (F-AC-09 §5.8) and ICS `EXDATE`s (F-AC-05 §5.12). There is **exactly one implementation**, mirrored by `isSchoolDay()` in `packages/domain/calendar` with a parity test — because the prototype had the opposite (a hardcoded five-day week in one file, a Saturday-start grid in another, and a setting read nowhere).

**RLS in words.** `holidays`, `holiday_scopes`, `calendar_events`, `working_day_overrides`: SELECT for any active member with role owner/admin/teacher/staff. Parents have **no direct policy**; they read through `parent_calendar_v` (F-AC-10 §3), which projects school-wide entries plus entries scoped to their child's section, filtered to `parent_visible = true` and `published = true`. INSERT/UPDATE/DELETE on `holidays`, `holiday_scopes` and `working_day_overrides`: owner/admin only. On `calendar_events`: owner/admin anywhere, plus a teacher policy allowing rows where `audience = 'section'` and the teacher is that section's class teacher, and only for rows they created. Rows with `source = 'exam'` are **system-owned**: no client may edit or delete them; they are maintained by the projection trigger in §5.8, so an admin who wants to move an exam moves the exam. `workspace_id` immutable everywhere; platform admin read-only.

**Private files.** None. Printed year planners land in `files` with `visibility='workspace'`.

**Seed.** `supabase/seed/bd-holidays.sql` supplies a per-year Bangladesh set — fixed-date entries (21 February Shaheed Day, 26 March Independence Day, 1 May May Day, 16 December Victory Day, and the school's chosen new-year date) plus **editable placeholders** for lunar-calendar holidays (Eid-ul-Fitr, Eid-ul-Adha, Ashura, Eid-e-Miladunnabi, Shab-e-Barat, Shab-e-Qadr) and the major non-Muslim festivals (Durga Puja, Buddha Purnima, Christmas, Janmashtami). Lunar dates are **approximate by construction** and the seed says so on every such row (§5.3).

## 4. Workflows

**4.1 Seed the year.**
_Trigger:_ admin opens `/app/calendar` on a new academic year, or finishes the F-AC-01 setup wizard, which offers "Add Bangladesh holidays for 2026?".
_Steps:_ one tap seeds the fixed-date holidays exactly and the lunar ones as **draft placeholders** marked "date to be confirmed", each with an edit affordance. A review list shows all of them with counts ("11 holidays · 6 need confirming · 48 school days in Term 1").
_Outcome:_ `holidays` rows with `source = 'seed'`.
_Notifications:_ none (nobody needs a notification for a seed).
_Audit:_ `calendar.seeded` with the count.
_Failures:_ seeding twice is idempotent on `(workspace, academic_year, name, starts_on)` and reports "already seeded"; a seeded range falling outside the academic year is clamped and flagged.

**4.2 Declare a holiday.**
_Trigger:_ admin taps "Add holiday" on the calendar.
_Steps:_ a sheet — name, kind, date or range, optional scope (whole school / a grade / a section), optional note. Before saving, the sheet shows an **impact preview**: "This closes 3 school days. 4 attendance sessions already exist on those days. 2 assignments are due. 1 exam paper is scheduled." Save.
_Outcome:_ the holiday row; every dependent computation changes on the next read, because they all call `app.is_school_day`.
_Notifications:_ `calendar.holiday.declared` to all staff, and to parents when the calendar is published; `calendar.conflict` to the affected teachers when existing sessions, due dates or exams fall inside it.
_Audit:_ `calendar.holiday.created` with the impact counts.
_Failures:_ overlapping an existing holiday of the same scope → a warning listing it, with "merge into the existing one?" — never a silent duplicate. Retroactively declaring a day on which attendance was already taken does **not** delete those sessions (F-AC-03 §11.5): the register footnotes them and an explicit, audited "void sessions for this day" action is offered.

**4.3 Working-day override.**
_Trigger:_ the school announces a make-up class on a Friday, or closes on a working Tuesday for a local strike.
_Steps:_ "Override a day" sheet — date, is-working toggle, reason, optional short bell schedule. The same impact preview runs in reverse ("this adds 1 school day; 22 sections have no timetable entry for Friday").
_Outcome:_ a `working_day_overrides` row; `app.is_school_day` returns the override's value for that date, ahead of both the weekly pattern and any holiday.
_Notifications:_ `calendar.override.created` to staff.
_Audit:_ `calendar.override.created` with the reason (always required).
_Failures:_ an override on a date with an existing override → it updates the row rather than creating a second.

**4.4 Add an event.**
_Trigger:_ admin, or a class teacher for their own section.
_Steps:_ title, kind, date/range, optional times, audience (school / staff / parents / a section), location, `cancels_classes` toggle, parent-visible toggle. When `cancels_classes` is on, the day stays a school day but the timetable view shows the periods as cancelled and attendance is still expected unless a holiday or override says otherwise — the two concepts are deliberately separate.
_Outcome:_ a `calendar_events` row.
_Notifications:_ `calendar.event.published` to the chosen audience, once; parents get it only when `parent_visible`.
_Audit:_ `calendar.event.created`.
_Failures:_ a teacher choosing an audience other than their own section → refused by permission and RLS.

**4.5 Exam projection.** When an exam is scheduled (F-AC-06 §4.1), a trigger writes or updates `calendar_events` rows with `source = 'exam'` and `source_ref_id = exams.id`, one per exam date range (and per paper when the school wants the detail). They are read-only in the calendar UI and are deleted when the exam is deleted. This is the layer the prototype defined a colour for and never built.

**4.6 Views.** `/app/calendar` offers **Month** (the default at ≥1024), **Agenda** (the default on a phone — a grouped list by date, far more usable than a squeezed grid) and **Year planner** (a 12-month heat strip for printing). Filter chips: Holidays · Exams · Events · My sections. The week always starts on `min(working_days)` in the school's ordering (the prototype hardcoded Saturday regardless of the setting).

**4.7 Exports.** ICS of the school calendar (holidays + events, with the parent-visible subset for a family subscription URL) through the same signed, revocable subscription mechanism as F-AC-05, and an A4 landscape **year planner** PDF with the school header for the noticeboard.

**4.8 Publish.** A calendar starts as the admin's working copy; **Publish** flips `published` on the year's entries and makes them parent-visible, notifying guardians once. Unpublished events are staff-only.

**4.9 Phone specifics.** Agenda view is the phone default: sticky month header, 64 px date-grouped rows, holiday rows tinted, "Today" pinned at the top on first load. Adding a holiday or event is a bottom sheet with a sticky Save and the impact preview inline above it, so the admin sees the consequence without leaving the thumb zone. The month grid is available on a phone but is not the default.

## 5. Business rules and calculations

**5.1 The school-day decision, in precedence order.** `app.is_school_day(workspace, d, section?)`:

```
1. working_day_overrides for d exists          ->  return override.is_working
2. d's weekday not in school_profiles.working_days  ->  false
3. a holiday covers d AND applies to the section    ->  false
4. otherwise                                        ->  true
```

An override therefore beats everything — which is exactly what a make-up day is. Holiday applicability: `applies_to_all` and no `holiday_scopes` rows → school-wide; otherwise it applies when a scope row matches the section or its grade level. With `section_id` omitted, a scoped holiday is treated as **not** closing the school (the school-wide answer), so a Class 11 board-exam closure does not shrink Class 6's attendance denominator.

**5.2 School days in a range** = `count(app.school_days(workspace, from, to, section))`. This single expression is the denominator for: attendance reporting and "sessions missing" (F-AC-03 §5.6), leave day computation (F-AC-04 §5.4), the staff monthly rate denominator (F-AC-04 §5.6), pacing (periods remaining), and the analytics gap rule (F-AC-09 §5.8).

**5.3 Lunar holidays are approximate.** Seeded Eid/Ashura/Shab-e-Barat rows carry `source = 'seed'` and a `note` marking the date as unconfirmed; the UI shows a "confirm date" chip until an admin edits or explicitly confirms the row. The seed never pretends to know a moon sighting. A single "Confirm all" action clears the chips once the school has its own list.

**5.4 Recurring holidays.** `is_recurring` with a fixed-date `recurrence_rule` (e.g. `FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=16`) is materialised into concrete `holidays` rows when a new academic year is created — never evaluated at query time, because `app.is_school_day` must be a cheap index lookup and a date must be auditable as a row. Lunar holidays are never recurring.

**5.5 Holidays vs cancelled classes vs events.** Three distinct things, deliberately not merged:

- A **holiday** means no school day: no attendance expected, no leave consumed, excluded from every denominator, `EXDATE` in ICS.
- `cancels_classes` on an **event** means the day is still a school day (staff attend, attendance may still be taken) but the timetable shows periods as cancelled.
- A plain **event** changes nothing computational; it is information.
  The prototype had none of the three, which is why an untaken day and a holiday were indistinguishable and both plotted as 0 %.

**5.6 Retroactive changes never destroy data.** Declaring a holiday over a date that already has attendance sessions, marks or approved leave leaves those rows intact. Percentages recompute from **records**, not from calendar days (F-AC-03 §5.6), so a retroactive holiday cannot silently change a child's attendance percentage; the register footnotes the affected sessions. Approved leave keeps its stored `days` value (F-AC-04 §5.4) for the same reason.

**5.7 Week start** = the first entry of `school_profiles.working_days` in the school's ordering, default Saturday for `[6,0,1,2,3,4]`. Every month grid, agenda header and year planner uses it; no component computes its own.

**5.8 Exam projection is one-way.** `calendar_events` rows with `source = 'exam'` are written by a trigger on `exams`/`exam_subjects` and are immutable from the client. Editing the exam edits the calendar; editing the calendar cannot edit the exam. Deleting the exam deletes its projected rows.

**5.9 Term boundaries.** The calendar shows term ranges as background bands from F-AC-01 and warns when a holiday spans a term boundary or when a term has fewer than `academics.min_term_days` (default 45) school days — a cheap check that catches a mis-typed date before it corrupts a term's attendance denominator.

**5.10 Timezone.** Every date is a `date` in `school_profiles.timezone`; "today" is `(now() at time zone tz)::date`, computed in SQL (PRODUCT-DECISIONS 6.10). No client sends "today".

**5.11 ICS.** Holidays become all-day `VEVENT`s with `TRANSP:TRANSPARENT`; events carry their times when set; the parent subscription projects only `parent_visible and published` rows. `UID = <row id>@acadigma`, `TZID` from the school profile.

## 6. UI

| Screen                         | Route                              | 360×800                                                                                         | ≥1024                                                                              | Primary action      | Empty                                                           | Loading         | Error                                              |
| ------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- | --------------- | -------------------------------------------------- |
| Calendar (agenda)              | `/app/calendar`                    | **Default on phone**: date-grouped rows, sticky month header, "Today" pinned, filter chips, FAB | Available as a list toggle                                                         | Add holiday / event | "Nothing scheduled — add the year's holidays" with the seed CTA | 8 skeleton rows | Retry banner; filters stay usable                  |
| Calendar (month)               | `/app/calendar?view=month`         | Available but not default; swipe between months                                                 | **Default at ≥1024**: month grid with term bands, holidays tinted, events as chips | Add                 | "No entries this month"                                         | Grid skeleton   | Retry                                              |
| Year planner                   | `/app/calendar?view=year`          | 12 stacked month strips, horizontally scrollable                                                | 12-month grid                                                                      | Print               | "No academic year yet" → F-AC-01                                | Skeleton        | Retry                                              |
| Holiday sheet                  | sheet                              | Name, kind, date/range, scope, note, **impact preview**, sticky Save                            | Dialog                                                                             | Save                | n/a                                                             | Preview spinner | Overlap warning with "merge?"; save still possible |
| Event sheet                    | sheet                              | Title, kind, date/times, audience, location, `cancels_classes`, parent-visible, sticky Save     | Dialog                                                                             | Save                | n/a                                                             | Spinner         | Field errors                                       |
| Override sheet                 | sheet                              | Date, is-working toggle, **required** reason, optional bell schedule, impact preview            | Dialog                                                                             | Save                | n/a                                                             | Preview spinner | `REASON_REQUIRED`                                  |
| Seed review                    | `/app/calendar/seed`               | List of seeded holidays with "date to be confirmed" chips and per-row edit                      | Table with bulk confirm                                                            | Confirm all         | n/a                                                             | Skeleton        | Retry                                              |
| Settings (year + working days) | `/app/settings/academics/calendar` | Working-day checkboxes with a live week preview, timezone, min term days                        | Two-column                                                                         | Save                | n/a                                                             | Skeleton        | Field errors                                       |

`packages/ui`: `AgendaList`, `MonthGrid`, `YearStrip`, `ImpactPreview` (the reusable "what will this break?" block), `DateRangeSheet`, `AudiencePicker`, `FilterChips`, `ConfirmChip`, `EmptyState`, `CopyableLink` (ICS subscription).

## 7. Server contracts

| Action / handler                | Input schema (Zod)                                                                                                                                                                      | Output                                                                                                                             | Errors                                                                                              | Idempotency                              | Rate limit |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- |
| `seedBdHolidays`                | `SeedHolidaysInput` {academicYearId, includeReligions: string[]}                                                                                                                        | `{created: number, needsConfirming: number}`                                                                                       | `ALREADY_SEEDED`, `YEAR_NOT_FOUND`                                                                  | key on (workspace, year, 'holiday-seed') | 5/h        |
| `upsertHoliday`                 | `HolidayInput` {id?, academicYearId, name, nameBn?, kind, startsOn, endsOn, scopes?: [{gradeLevelId?, sectionId?}], note?}                                                              | `Holiday`                                                                                                                          | `RANGE_OUTSIDE_YEAR`, `INVALID_RANGE`, `HOLIDAY_OVERLAP` (warning payload with the conflicting row) | key required                             | 120/h      |
| `deleteHoliday`                 | `HolidayIdInput` {holidayId}                                                                                                                                                            | `{deleted: true}`                                                                                                                  | —                                                                                                   | —                                        | 60/h       |
| `previewCalendarImpact`         | `ImpactPreviewInput` {academicYearId, dates: {startsOn, endsOn}, isWorking: boolean, scope?}                                                                                            | `CalendarImpact` {schoolDaysAffected, attendanceSessions, assignmentsDue, examPapers, approvedLeaveDays, sectionsWithoutTimetable} | —                                                                                                   | —                                        | 600/h      |
| `upsertWorkingDayOverride`      | `WorkingDayOverrideInput` {academicYearId, date, isWorking, reason, bellScheduleId?}                                                                                                    | `WorkingDayOverride`                                                                                                               | `REASON_REQUIRED`                                                                                   | key on (workspace, date)                 | 120/h      |
| `deleteWorkingDayOverride`      | `{date}`                                                                                                                                                                                | `{deleted: true}`                                                                                                                  | —                                                                                                   | —                                        | 60/h       |
| `upsertCalendarEvent`           | `CalendarEventInput` {id?, academicYearId, title, kind, startsOn, endsOn, startsAt?, endsAt?, audience, sectionId?, gradeLevelId?, location?, cancelsClasses, parentVisible, published} | `CalendarEvent`                                                                                                                    | `NOT_CLASS_TEACHER`, `AUDIENCE_NOT_ALLOWED`, `SYSTEM_EVENT_IMMUTABLE`                               | key required                             | 300/h      |
| `deleteCalendarEvent`           | `EventIdInput`                                                                                                                                                                          | `{deleted: true}`                                                                                                                  | `SYSTEM_EVENT_IMMUTABLE`                                                                            | —                                        | 120/h      |
| `publishCalendar`               | `PublishCalendarInput` {academicYearId}                                                                                                                                                 | `{published: number}`                                                                                                              | `NOTHING_TO_PUBLISH`                                                                                | key required                             | 20/h       |
| `voidSessionsForDay`            | `VoidSessionsInput` {date, sectionIds?, reason}                                                                                                                                         | `{voided: number}`                                                                                                                 | `REASON_REQUIRED`                                                                                   | key required                             | 20/h       |
| `GET /api/calendar`             | `CalendarQuery` {from, to, kinds?, sectionId?, view}                                                                                                                                    | `CalendarEntry[]` (holidays + events + term bands + exam projections)                                                              | —                                                                                                   | —                                        | 1200/h     |
| `GET /api/calendar/school-days` | `SchoolDaysQuery` {from, to, sectionId?}                                                                                                                                                | `{days: string[], count: number}`                                                                                                  | —                                                                                                   | —                                        | 1200/h     |
| `GET /api/calendar/ics`         | `IcsQuery` {token} (signed, revocable) or authenticated {scope}                                                                                                                         | `text/calendar`                                                                                                                    | `INVALID_TOKEN`, `REVOKED`                                                                          | —                                        | 600/h      |
| `POST /api/pdf/year-planner`    | `YearPlannerPdfInput` {academicYearId, queuePrint?}                                                                                                                                     | `{fileId, printJobId?}`                                                                                                            | —                                                                                                   | key required                             | 20/h       |

SQL routines exported to the rest of the product: `app.is_school_day(workspace_id, date, section_id?)`, `app.school_days(workspace_id, from, to, section_id?)`, `app.school_day_count(workspace_id, from, to, section_id?)`. Domain mirror: `isSchoolDay()`, `schoolDays()` in `packages/domain/calendar`, with a SQL↔TS parity test.

## 8. Parts (build chunks)

**Part 1 — Holidays, overrides and `app.is_school_day`** · `holidays`, `holiday_scopes`, `working_day_overrides` with enums, GiST range index and RLS; the precedence function in SQL and its TS mirror with the parity test; `GET /api/calendar/school-days` · tests: pgTAP for tenant isolation, role escalation (a teacher cannot declare a holiday), and the precedence table (override beats weekday beats holiday); a parity matrix over a year of dates × three working-day patterns × scoped and unscoped holidays · **Demo:** declare Eid as a 3-day holiday and watch `school_days` for that month drop by three in both SQL and TS.

**Part 2 — Bangladesh seed and the seed review** · `bd-holidays.sql` with fixed-date exact rows and lunar placeholders marked unconfirmed, the one-tap seed from the F-AC-01 wizard and the calendar empty state, the review list with confirm chips and bulk confirm · tests: seed idempotency; clamping to the academic year; every lunar row flagged unconfirmed · **Demo:** a new school taps "Add Bangladesh holidays for 2026" and gets 11 holidays, 6 marked "date to be confirmed".

**Part 3 — Events, audiences and the agenda/month/year views** · `calendar_events` with the audience model and the class-teacher policy, agenda view as the phone default, month grid with term bands using the school's week start, year planner, filter chips · tests: RLS proving a class teacher can create only section-scoped events for their own section; week-start correctness for Sat-, Sun- and Mon-start schools · **Demo:** an admin adds Sports Day for the whole school and a class teacher adds a Class 6 – A trip; the teacher cannot add a school-wide event.

**Part 4 — Impact preview, exam projection, publishing and exports** · `previewCalendarImpact` counting affected sessions, due assignments, exam papers and approved leave; the exam-projection trigger with immutable `source = 'exam'` rows; `voidSessionsForDay`; publish + parent visibility; ICS with signed revocable subscriptions; A4 year-planner PDF with the school header · tests: impact counts against a fixture; a client attempt to edit a projected exam event refused; ICS golden file parsed by `ical.js` with holidays as all-day transparent events · **Demo:** declare a flood closure over three days, see "12 attendance sessions, 4 assignments, 1 exam paper affected" before saving, then publish and watch the days vanish from every teacher's ICS feed.

## 9. Acceptance criteria

1. **Given** `working_days = [6,0,1,2,3,4]` (Sat–Thu), **when** `app.is_school_day` is called for a Friday, **then** it returns false; **when** a `working_day_overrides` row sets that Friday `is_working = true`, **then** it returns true — the override wins over the weekly pattern.
2. **Given** a holiday covering 10–12 April, **when** `school_days(1 Apr, 30 Apr)` is computed, **then** those three dates are absent and the count drops by exactly the number of them that were otherwise school days.
3. **Given** a holiday scoped to Class 11 only, **when** `is_school_day(d, section = Class 6 – A)` is called, **then** it returns true; **when** called for a Class 11 section, **then** false; **when** called with no section, **then** true (the school-wide answer).
4. **Given** any date, working-day pattern and holiday set, **when** the SQL function and the TS mirror are compared over a full year, **then** they agree on every date (parity test; CI fails on a single disagreement).
5. **Given** a declared holiday, **when** the attendance analytics chart renders that day, **then** it is a **gap**, not a 0 % point (F-AC-09 §5.8 reading this feature's answer — the exact prototype bug).
6. **Given** a declared holiday, **when** a teacher opens the roll-call screen for that date, **then** a banner says "This is a holiday (Eid). Take attendance anyway?" and taking it remains possible but deliberate.
7. **Given** a leave request spanning 3–5 March with 4 March a holiday, **when** the days are computed, **then** it consumes 2.0 days — F-AC-04 calling `school_days`.
8. **Given** a teacher's ICS subscription and a holiday on 26 March, **when** the feed is fetched, **then** 26 March is an `EXDATE` and no class event is generated for it.
9. **Given** a holiday declared retroactively over a day with 4 saved attendance sessions, **when** it is saved, **then** those sessions still exist, the affected teachers receive `calendar.conflict`, the monthly register footnotes them, and no child's attendance percentage changes silently.
10. **Given** an admin adding a 3-day holiday, **when** the sheet opens the impact preview, **then** it reports the number of school days closed, attendance sessions, assignments due, exam papers and approved-leave days affected — before the save, not after.
11. **Given** a scheduled exam, **when** the calendar loads, **then** the exam appears as a read-only entry; **when** a client attempts to edit or delete it, **then** it is refused with `SYSTEM_EVENT_IMMUTABLE`; **when** the exam is deleted, **then** the entry disappears.
12. **Given** a class teacher of Class 6 – A, **when** they create an event with `audience = 'school'`, **then** it is refused by both the permission check and RLS; **when** they create one scoped to Class 6 – A, **then** it succeeds.
13. **Given** a working-day override saved with no reason, **when** the action runs, **then** it is refused with `REASON_REQUIRED`.
14. **Given** an unpublished calendar, **when** a parent loads their calendar tab, **then** they see nothing; **when** it is published, **then** they see school-wide and their child's section entries with `parent_visible = true` and no others.
15. **Given** a Sunday-start school, **when** the month grid renders, **then** the first column is Sunday — read from `working_days`, not hardcoded (the prototype hardcoded Saturday).
16. **Given** a term with 38 school days and `min_term_days = 45`, **when** the calendar loads, **then** a non-blocking warning names the term and the count.
17. **Given** two workspaces, **when** a member of workspace A queries holidays or events, **then** no row from workspace B is returned.
18. **Given** an admin on a 360×800 phone, **when** they open `/app/calendar`, **then** the agenda view renders by default with "Today" pinned, and adding a holiday is a sheet whose Save button and impact preview are both in the thumb zone.

## 10. Tests

- **Unit (`packages/domain/calendar`)**: `isSchoolDay` across the full precedence table (override true/false × weekday in/out × holiday covering/not × scoped/unscoped); `schoolDays(range)` across month, term and year ranges; `weekStart(workingDays)` for Sat-, Sun- and Mon-start schools; `materialiseRecurring(rule, year)`; `termDayCount`; `icsHolidayBlocks`.
- **Parity test**: `app.is_school_day` vs `isSchoolDay()` over a generated year × 3 working-day patterns × 20 holiday sets — the single test that keeps the whole product's denominators honest.
- **DB (pgTAP)**: isolation and escalation on `holidays`, `holiday_scopes`, `calendar_events`, `working_day_overrides`; a teacher cannot insert a holiday or an override; the class-teacher event policy (positive for own section, negative for another section and for `audience = 'school'`); `source = 'exam'` rows immutable from any client role; parents have no direct policy (asserted against `pg_policies`); `workspace_id` immutability; the range check and the GiST index used by the containment query (EXPLAIN assertion).
- **Integration**: seed idempotency and year clamping; `previewCalendarImpact` counts against a fixture with sessions, assignments, an exam and approved leave; retroactive holiday leaving records intact; `voidSessionsForDay` auditing; exam-projection trigger on create, update and delete; publish making entries parent-visible.
- **Cross-feature tests** (these live here because this feature is the shared dependency): attendance monthly denominator (F-AC-03), leave day count (F-AC-04), ICS `EXDATE` (F-AC-05), analytics gap (F-AC-09) and the parent calendar (F-AC-10) each asserted against a calendar fixture containing a holiday, an override and a scoped closure.
- **E2E (360×800 and 1280×800, axe)**: `seed-bd-holidays`, `declare-holiday-with-impact-preview`, `override-a-friday`, `teacher-section-event-only`, `year-planner-print`. Axe clean on agenda, month and the sheets.
- **Performance budgets**: `app.is_school_day` < 2 ms (index lookup, no recurrence evaluation at query time); `school_days` for a year < 50 ms; `GET /api/calendar` for a month < 200 ms; agenda view first paint < 1.2 s on a mid-range Android.

## 11. Open questions

1. **Lunar holiday accuracy.** The seed ships approximate dates flagged as unconfirmed. Assumed correct — no calendar library can predict a moon sighting, and pretending otherwise would corrupt attendance denominators. A future option is an annual curated dataset published per Hijri year, which the owner may want to maintain centrally in `/platform`.
2. **Half-day holidays** (school closes at noon for a funeral). Not modelled: the day is either a school day or not. Assumed acceptable; a school would use an event with `cancels_classes` and take attendance normally. If it must affect the denominator, it becomes `working_day_overrides.day_fraction`, reusing the `day_half` enum introduced in F-AC-04.
3. **Multi-campus / shift-specific holidays.** `holiday_scopes` handles grade and section; a shift-level closure would need `shift` on the scope row. Deferred with multi-campus (PRODUCT-DECISIONS §7).
4. **Whether `cancels_classes` should suppress attendance.** Currently no — the day stays a school day and attendance is still expected. Flagged for the owner: a school with a full-day sports event may reasonably want attendance taken at the field, which is what the current behaviour supports.
5. **Government holiday feeds.** No public API is reliable for BD. Assumed: the curated seed plus admin editing is the honest answer for v1, and an ICS import (`source = 'import'`) is a small later part if a ministry feed appears.
6. **Retention of past years' calendars.** Assumed indefinite — they are tiny and every historical attendance recomputation needs them. Deleting an academic year is blocked by `on delete restrict` from `holidays`.
7. **Part 1 demo cut (D-202, PR #43).** Built: `holidays` (no `academic_year_id`, no scopes, no recurrence yet), `working_day_overrides`, `app.is_school_day(workspace_id, date)`, `app.school_days`, `app.school_day_count`, and a holidays list/add/remove screen at `/app/settings/calendar` (the settings home links to it; `/app/calendar` views are Part 3). The functions are SECURITY DEFINER behind a membership guard (D-203, superseding D-202's invoker choice, which gave parents the wrong answer). The spec's `HOLIDAY_OVERLAP` warning is deferred: an exact duplicate (same name and first day) is refused, and overlapping holidays close each date once. There is no `section_id` argument until `holiday_scopes` exists, which needs `sections`. `academic_year_id` is a follow-up: `academic_years` (PR #37) merged while this PR was open. Still open: the TS mirror with its SQL↔TS parity test, `GET /api/calendar/school-days`, and an override screen (the table and precedence are built and tested).
