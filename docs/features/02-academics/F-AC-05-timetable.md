# F-AC-05 — Timetable (bell schedule, slots, clash detection, exports)

|                  |                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                               |
| Status           | planned                                                                                                                                 |
| Owner branch     | `feat/academics-timetable`                                                                                                              |
| Depends on       | F-AC-01 (sections, section_subjects, rooms), F-AC-11 (working days, holidays), F-AC-04 (teacher availability for the cover engine)      |
| Plan             | `docs/plan/ROADMAP.md` chunk 5                                                                                                          |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (ScheduleSlot), §3 features 40–43, 45–46, §4.2, §6 items 16, 36, 42, 56, §7 Q5 |

## 1. Purpose

The timetable is the school's clock. Teachers need "what am I teaching next?", the office needs "who is free in period 3?" (the cover engine's core question), students and parents need the week's routine, and the pacing planner needs the number of periods a subject actually gets. This feature defines the **bell schedule** (periods with start/end times, breaks, assemblies) per school, the **working days**, the **timetable slots** per section for a repeating week, **clash detection** for teachers and rooms, a **teacher view**, a **room view**, an **ICS export** and a printable weekly routine. "Done": an admin fills a section's week in ten minutes on a phone with clashes refused as they type, every teacher's dashboard shows their next period with the room, and the cover engine can answer "who is free at Sunday period 3" with one query.

**Base44 intent vs reality.** `ScheduleSlot` pointed at a `Class` whose teacher was a free-text name, so the timetable knew nothing about _who_ taught. There was **no teacher ownership, no room on the slot, and no clash detection at all**. `day_of_week` was an enum of Monday–Saturday — **no Sunday** — while the page's own day generator could produce `"Sunday"`, so Sunday-start schools (normal in Bangladesh) wrote out-of-enum values. The page hardcoded exactly five consecutive days and ignored `SchoolSettings.work_week_days` entirely, which was collected in settings and read nowhere. The route had **no role guard**, so any authenticated user — including a parent — could create, edit and delete timetable slots. The timetable never appeared on the master calendar (`EVENT_COLORS.schedule` was defined and never used). PRODUCT-DECISIONS 2.5 fixes the week: `school_profiles.working_days` default Sat–Thu, Asia/Dhaka, no hardcoded week anywhere.

## 2. Roles and permissions

| Action                             | Permission key             | owner | admin | teacher         | staff | parent                           | platform |
| ---------------------------------- | -------------------------- | ----- | ----- | --------------- | ----- | -------------------------------- | -------- |
| View a section's timetable         | `timetable.read`           | yes   | yes   | yes             | yes   | own children's section (F-AC-10) | no       |
| View own teaching timetable        | `timetable.read_own`       | yes   | yes   | yes             | yes   | no                               | no       |
| View the teacher grid / room grid  | `timetable.read_all`       | yes   | yes   | yes (read-only) | yes   | no                               | no       |
| Create/edit the bell schedule      | `timetable.bell.write`     | yes   | yes   | no              | no    | no                               | no       |
| Create/edit/delete timetable slots | `timetable.write`          | yes   | yes   | no              | no    | no                               | no       |
| Publish a timetable version        | `timetable.publish`        | yes   | yes   | no              | no    | no                               | no       |
| Export ICS / print                 | `timetable.export`         | yes   | yes   | yes (own)       | yes   | own children                     | no       |
| Override a clash (with reason)     | `timetable.override_clash` | yes   | yes   | no              | no    | no                               | no       |

The prototype's unguarded route is closed: only owner and admin write. Teachers read everything (they swap and cover) and export their own calendar.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table.

**`bell_schedules`** — a named set of periods; a school may have more than one (e.g. "Regular", "Ramadan", "Exam days"): `name text`, `is_default bool`, `applies_to_shift text null`, `effective_from date null`, `effective_to date null`, `is_active bool`.
Index: `unique (workspace_id, name)`, partial `unique (workspace_id) where is_default`.

**`bell_periods`** — `bell_schedule_id`, `period_no int`, `label text` ("Period 1", "Tiffin", "Assembly", "Jumu'ah"), `kind period_kind` (`class|break|assembly|prayer|lunch|other`), `starts_at time`, `ends_at time`, `duration_minutes int generated`, `sort int`.
Indexes: `unique (bell_schedule_id, period_no)`, exclusion constraint preventing overlapping time ranges within one schedule.

**`timetable_slots`** — the repeating week: `academic_year_id`, `section_id`, `day_of_week int` (**0–6, ISO-ish with 0 = Sunday**, an integer rather than a day-name enum precisely because the prototype's Monday–Saturday enum excluded Sunday), `bell_period_id`, `period_no int` (denormalised for fast grids), `section_subject_id` (which carries subject + primary teacher), `teacher_id uuid null references workspace_members` (defaults to the section_subject's primary teacher; overridable so a co-teacher can own a specific slot), `room_id uuid null`, `is_double bool default false`, `note text null`, `version_id uuid references timetable_versions`, `effective_from date null`, `effective_to date null`.
Indexes: `unique (version_id, section_id, day_of_week, period_no)`, `index (workspace_id, teacher_id, day_of_week, period_no)` (the cover engine's query), `index (workspace_id, room_id, day_of_week, period_no)`.

**`timetable_versions`** — so a mid-year revision does not rewrite history: `academic_year_id`, `name text` ("Term 1 routine"), `status timetable_status` (`draft|published|superseded`), `effective_from date`, `effective_to date null`, `published_at`, `published_by`.
Index: `index (workspace_id, academic_year_id, status)`.

**`timetable_clash_overrides`** — an audited escape hatch: `slot_id`, `kind clash_kind` (`teacher|room|section`), `conflicting_slot_id`, `reason text`, `approved_by`, `approved_at`.

**`timetable_exceptions`** (thin, feeds F-AC-11 and the cover engine): `date date`, `section_id null`, `teacher_id null`, `bell_period_id null`, `kind exception_kind` (`cancelled|moved|room_changed|substituted`), `replacement_slot jsonb null`, `reason text`.
Index: `index (workspace_id, date)`.

**Enums**: `period_kind`, `timetable_status`, `clash_kind`, `exception_kind`.

**RLS in words.** All tables: SELECT for any active member with role owner/admin/teacher/staff; parents read a section's published slots only through the parent view scoped by `app.is_guardian_of`. INSERT/UPDATE/DELETE restricted to owner/admin (closing the prototype's unguarded route). Additionally, writes are refused when the slot's `version_id` points at a `published` version older than the current one (`status='superseded'`) or when the academic year is closed. `timetable_clash_overrides` writes require owner/admin and always carry a reason. `workspace_id` immutable; platform admin read-only.

**Private files.** None. Printed routines land in `files` with `visibility='workspace'`.

**Working days** are **not** stored here: they come from `school_profiles.working_days` (an array of ints 0–6, default `[6,0,1,2,3,4]` = Sat, Sun, Mon, Tue, Wed, Thu) per PRODUCT-DECISIONS 2.5.

## 4. Workflows

**4.1 Define the bell schedule.**
_Trigger:_ admin opens `/app/settings/academics/bell` (also step 3 of the timetable wizard).
_Steps:_ pick a preset — "6 periods + tiffin", "8 periods", "Ramadan short day" — or build rows: label, kind, start, end. Durations and the day's end time compute live. Save.
_Outcome:_ one default `bell_schedules` with its `bell_periods`; every timetable grid is built from it, so no screen invents period times.
_Audit:_ `bell_schedule.saved`.
_Failures:_ overlapping period times → the exclusion constraint refuses and the offending row is highlighted; a break with no surrounding class period is allowed (schools do that).

**4.2 Build a section's week.**
_Trigger:_ admin opens a section → Timetable tab, or `/app/timetable?section=…`.
_Steps (phone):_ the screen is a **day-tab layout**, not a 7×8 grid: tabs for the school's working days across the top, and under the selected day a vertical list of that day's periods from the bell schedule. An empty period shows "+ Add". Tapping it opens a sheet: subject (from the section's `section_subjects`, showing the primary teacher), teacher (pre-filled, changeable), room (pre-filled from the section's room), double-period toggle. Save.
_Live clash check:_ as soon as subject/teacher/room are chosen, the sheet calls `checkTimetableClash` and shows an inline red line — "Mr. Rahman already teaches Class 7 – B at this time" — with the conflicting slot linked. Saving a clashing slot is refused unless the admin taps "Override" and types a reason.
_Outcome:_ a `timetable_slots` row on the current draft version.
_Notifications:_ none per slot (too noisy); `timetable.published` on publish.
_Audit:_ `timetable.slot.created` / `.updated` / `.deleted`.
_Failures:_ the section_subject's teacher is inactive → `MEMBER_NOT_ACTIVE`; the period is a break → the sheet refuses class assignment unless the school explicitly allows it.

**4.3 Copy a day / copy a week.** Top-bar actions: "Copy Sunday to…" (multi-select days) and "Copy from another section" (pick a section, choose to keep or clear teachers). Both run clash detection on the whole batch first and present a pre-flight report: "18 slots will be created · 2 clashes" with the clashes listed and skippable. Audit `timetable.bulk_copied`.

**4.4 Publish.** A timetable is built on a `draft` version. **Publish** sets `status='published'`, `effective_from` (default tomorrow), supersedes the previous published version at that date, and emits `timetable.published` to all teachers and to parents of affected sections. Draft edits never affect what anyone sees. Audit `timetable.published`. Failure: publishing a version with unresolved clashes and no overrides → `UNRESOLVED_CLASHES` with the list.

**4.5 Teacher view.** `/app/timetable/me` (and a "Next period" card on the dashboard): the teacher's own week built from `timetable_slots where teacher_id = me`, with free periods shown explicitly (the cover engine and the teacher both care about the gaps). The card shows "Now: Class 6 – A · Mathematics · Room 204" and "Next at 10:20: Class 8 – B · Room 109", computed in the school timezone.

**4.6 Room view and workload.** `/app/timetable/rooms` shows a room × period grid for the selected day, highlighting double-bookings. `/app/timetable/workload` shows per-teacher **scheduled** periods per week — which the workload balancer (teaching area) compares against **logged** periods per PRODUCT-DECISIONS 3.8. This feature supplies only the scheduled number.

**4.7 Exports.** "Add to calendar" produces an **ICS** feed: for a teacher, every slot expanded as a weekly `RRULE` bounded by the academic year, with holidays from F-AC-11 emitted as `EXDATE`s, `LOCATION` = room, `SUMMARY` = "Class 6 – A · Mathematics". Two delivery modes: a one-off `.ics` download and a **signed subscription URL** (`/api/timetable/ics?token=…`, HMAC over member + purpose, revocable) so Google Calendar stays in sync. Print produces an A4 landscape weekly routine per section or per teacher with the school header. PRODUCT-DECISIONS 6.9 lists ICS export as one of v1's three real integrations.

**4.8 Exceptions.** A one-day change (a period cancelled for a school event, a room swapped, a teacher substituted by the cover engine) writes a `timetable_exceptions` row rather than editing the repeating slot. Every view overlays exceptions for the date being shown; the printed routine shows the repeating week only.

**4.9 Phone specifics.** Day tabs at the top (horizontally scrollable, current day pre-selected), period list below with 64 px rows, "+ Add" targets full-width, the editing sheet's Save button sticky at the bottom. A pinch-free "week" view exists at ≥1024 only — a 6×8 grid never works at 360 px, and forcing it was one of the prototype's usability failures.

## 5. Business rules and calculations

1. **Working days** come from `school_profiles.working_days` (ints 0–6, Sunday = 0), default `[6,0,1,2,3,4]` (Sat–Thu), with `first_day_of_week` derived as `min(working_days)` in the school's ordering. Every grid, tab strip and ICS expansion iterates that array. **No screen hardcodes a week** and `day_of_week` is an integer, so Sunday is representable (the prototype's §6.16 bug is structurally impossible).
2. **Period times** come only from `bell_periods`; a slot stores `bell_period_id` and never its own times, so changing the bell schedule moves every slot consistently.
3. **Teacher clash:** two slots clash when `day_of_week` and `period_no` are equal, `teacher_id` is equal, both belong to the same **published-or-same-draft** version, their `[effective_from, effective_to]` ranges overlap, and neither is a `break` period. Formally the uniqueness we want is `unique (version_id, teacher_id, day_of_week, period_no)` — implemented as a partial unique index where `teacher_id is not null`, with `timetable_clash_overrides` as the only documented escape (which drops the index enforcement to a trigger check that consults the override table).
4. **Room clash:** same rule on `room_id`, skipped when `room_id is null` and when the room's `type` is `hall` and `school_profiles.allow_shared_hall = true` (assemblies).
5. **Section clash:** `unique (version_id, section_id, day_of_week, period_no)` — a section can only be in one place at once; no override exists for this one.
6. **Double periods** occupy two consecutive `period_no` values; the UI creates both rows with `is_double = true` and a shared `note`, and clash detection treats them independently.
7. **Periods per week per subject** = `count(timetable_slots where section_subject_id = X)`. Compared against `section_subjects.periods_per_week` (F-AC-01), the section detail page shows "Mathematics 5/6 · one period short". This number is also the denominator the pacing planner uses.
8. **Teacher scheduled load per week** = `count(slots where teacher_id = m and period kind = 'class')`; **scheduled minutes** = `Σ bell_periods.duration_minutes` over those slots. Both exported for the workload balancer and for cover extra-hours (`Σ minutes / 60`, PRODUCT-DECISIONS 6.3).
9. **Free at (day, period)** for the cover engine = active teacher members minus teachers with a slot at that (day, period) in the effective published version, minus members on leave/absent that date (F-AC-04), minus those already assigned a cover for it.
10. **"Now / next period"** = the `bell_period` whose `[starts_at, ends_at)` contains `now()` in `school_profiles.timezone` on a day in `working_days` that F-AC-11 does not mark a holiday; otherwise the next such period, which may be on the next school day.
11. **Effective version for a date** = the published version with the greatest `effective_from <= date` and (`effective_to is null` or `effective_to >= date`). Views for past dates therefore show the routine that was actually in force.
12. **ICS generation:** one `VEVENT` per slot with `DTSTART` on the first matching date at or after `effective_from`, `RRULE:FREQ=WEEKLY;BYDAY=<day>;UNTIL=<version end or year end>`, `EXDATE` for every holiday/non-working override in range, `TZID=Asia/Dhaka` (from `school_profiles.timezone`), `UID = slot_id@acadigma`. Exceptions in `timetable_exceptions` add `EXDATE` plus, for moves, a separate one-off `VEVENT`.
13. **Publishing** never mutates the previous version's rows; it sets `effective_to = new.effective_from - 1 day` on the superseded version. Attendance and lesson logs recorded against old slots stay valid.
14. **Break periods** carry no `section_subject_id` and are rendered from the bell schedule alone; they are not stored per section.

## 6. UI

| Screen            | Route                          | 360×800                                                                              | ≥1024                                                             | Primary action  | Empty                                                      | Loading                           | Error                                                                                  |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------- | ---------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| Section timetable | `/app/timetable?section=…`     | Day tabs + vertical period list, "+ Add" rows, sticky day summary                    | Full week grid (days × periods), drag to move, right detail panel | Add slot        | "No bell schedule yet → set periods" then "No slots → add" | Grid skeleton                     | Retry banner; edits preserved                                                          |
| Slot editor       | sheet                          | Subject, teacher, room, double toggle; live clash line; sticky Save                  | Dialog with the same live clash line                              | Save            | n/a                                                        | Inline spinner on the clash check | Clash shown inline with a link to the conflicting slot; Override behind a reason field |
| Bell schedule     | `/app/settings/academics/bell` | Ordered list of period rows with time pickers; presets at the top                    | Two-column with a live day preview                                | Add period      | "Choose a preset"                                          | Skeleton                          | Overlap highlighted                                                                    |
| My timetable      | `/app/timetable/me`            | Day tabs; "Now" and "Next" cards pinned at the top; free periods shown as light rows | Week grid + "today" column highlighted                            | Add to calendar | "You have no classes assigned"                             | Skeleton                          | Retry                                                                                  |
| Teacher grid      | `/app/timetable/teachers`      | Per-day list grouped by period showing who is where; search by teacher               | Teachers × periods grid with clash cells in red                   | Filter by day   | "No published timetable"                                   | Skeleton                          | Retry                                                                                  |
| Room grid         | `/app/timetable/rooms`         | Day tabs; rooms as rows                                                              | Rooms × periods grid                                              | Filter by day   | "No rooms defined"                                         | Skeleton                          | Retry                                                                                  |
| Workload          | `/app/timetable/workload`      | Teacher cards with periods/week and a bar                                            | Table with scheduled vs target                                    | Export CSV      | "No slots yet"                                             | Skeleton                          | Retry                                                                                  |
| Versions          | `/app/timetable/versions`      | List of versions with status chips and dates                                         | Table + diff panel                                                | Publish         | "One draft version"                                        | Skeleton                          | `UNRESOLVED_CLASHES` list                                                              |
| Print / export    | sheet                          | Choose section or teacher, orientation, Preview, Print, ICS link with copy button    | Same with a live preview                                          | Generate        | n/a                                                        | Render progress                   | Retry                                                                                  |

`packages/ui`: `DayTabs`, `PeriodList`, `TimetableGrid` (desktop only), `SlotSheet`, `ClashBanner`, `NowNextCard`, `VersionChip`, `CopySheet`, `EmptyState`, `ConfirmSheet`, `CopyableLink` (for the ICS subscription URL).

## 7. Server contracts

| Action / handler                                  | Input schema (Zod)                                                                                                                       | Output                                                               | Errors                                                                                                         | Idempotency                            | Rate limit                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| `upsertBellSchedule`                              | `BellScheduleInput` {id?, name, isDefault, periods: [{periodNo, label, kind, startsAt, endsAt}]}                                         | `BellSchedule`                                                       | `PERIOD_OVERLAP`, `NAME_TAKEN`                                                                                 | —                                      | 60/h                             |
| `seedBellSchedulePreset`                          | `BellPresetInput` {preset: 'six_plus_tiffin'                                                                                             | 'eight'                                                              | 'ramadan'}                                                                                                     | `BellSchedule`                         | `ALREADY_EXISTS`                 | key required | 10/h |
| `createTimetableVersion`                          | `CreateVersionInput` {academicYearId, name, copyFromVersionId?}                                                                          | `TimetableVersion`                                                   | `YEAR_CLOSED`                                                                                                  | key required                           | 20/h                             |
| `upsertTimetableSlot`                             | `TimetableSlotInput` {id?, versionId, sectionId, dayOfWeek (0–6), bellPeriodId, sectionSubjectId, teacherId?, roomId?, isDouble?, note?} | `TimetableSlot`                                                      | `TEACHER_CLASH`, `ROOM_CLASH`, `SECTION_CLASH`, `NOT_A_CLASS_PERIOD`, `MEMBER_NOT_ACTIVE`, `VERSION_PUBLISHED` | key on (version, section, day, period) | 600/h                            |
| `deleteTimetableSlot`                             | `SlotIdInput`                                                                                                                            | `{deleted: true}`                                                    | `VERSION_PUBLISHED`                                                                                            | —                                      | 300/h                            |
| `checkTimetableClash`                             | `ClashCheckInput` {versionId, sectionId, dayOfWeek, periodNo, teacherId?, roomId?, excludeSlotId?}                                       | `ClashResult` {teacher?: SlotRef, room?: SlotRef, section?: SlotRef} | —                                                                                                              | —                                      | 1800/h (typed into by the sheet) |
| `overrideClash`                                   | `OverrideClashInput` {slotInput, kind, conflictingSlotId, reason}                                                                        | `TimetableSlot`                                                      | `REASON_REQUIRED`                                                                                              | key required                           | 60/h                             |
| `copyTimetableDay`                                | `CopyDayInput` {versionId, sectionId, fromDay, toDays: number[], overwrite: boolean}                                                     | `CopyResult` {created, skipped, clashes[]}                           | —                                                                                                              | key required                           | 60/h                             |
| `copyTimetableFromSection`                        | `CopySectionInput` {versionId, fromSectionId, toSectionId, keepTeachers: boolean}                                                        | `CopyResult`                                                         | `SUBJECT_MISMATCH` (reported per slot, not fatal)                                                              | key required                           | 30/h                             |
| `publishTimetableVersion`                         | `PublishVersionInput` {versionId, effectiveFrom}                                                                                         | `TimetableVersion`                                                   | `UNRESOLVED_CLASHES` (with the list), `EFFECTIVE_IN_PAST`                                                      | key required                           | 30/h                             |
| `createTimetableException`                        | `TimetableExceptionInput` {date, kind, sectionId?, teacherId?, bellPeriodId?, replacementSlot?, reason}                                  | `TimetableException`                                                 | —                                                                                                              | key required                           | 120/h                            |
| `GET /api/timetable/ics`                          | `IcsQuery` {token} (signed, revocable) or {scope:'me'\|'section', id} for an authenticated one-off                                       | `text/calendar`                                                      | `INVALID_TOKEN`, `REVOKED`                                                                                     | —                                      | 600/h                            |
| `createIcsSubscription` / `revokeIcsSubscription` | `IcsSubscriptionInput` {scope, id} / `{subscriptionId}`                                                                                  | `{url}` / `{revoked:true}`                                           | —                                                                                                              | —                                      | 20/h                             |
| `POST /api/pdf/timetable`                         | `TimetablePdfInput` {scope:'section'\|'teacher'\|'room', id, versionId?, queuePrint?}                                                    | `{fileId, printJobId?}`                                              | —                                                                                                              | key required                           | 30/h                             |
| `GET /api/timetable/free-teachers`                | `FreeTeachersQuery` {date, periodNo, subjectId?}                                                                                         | `MemberRef[]` ranked by §5.9                                         | —                                                                                                              | —                                      | 600/h                            |

Exported selectors used elsewhere: `effectiveVersionFor(ctx, date)`, `slotsForTeacher(ctx, memberId, date)` (cover engine + F-AC-04 leave impact), `periodsPerWeek(ctx, sectionSubjectId)` (pacing), `nowAndNext(ctx, memberId)`.

## 8. Parts (build chunks)

**Part 1 — Bell schedule** · `bell_schedules` + `bell_periods` with the overlap exclusion constraint, presets, settings screen with a live day preview, `working_days` read from `school_profiles` · tests: pgTAP overlap constraint, unit for duration and day-end computation · **Demo:** define 8 periods plus tiffin; the preview shows 08:00–14:10 and every later grid uses these times.

**Part 2 — Versions and slots** · `timetable_versions`, `timetable_slots` with `day_of_week` as an integer, the three uniqueness indexes, slot sheet, day-tab phone layout, desktop grid · tests: pgTAP proving Sunday (0) is storable and that section double-booking is impossible; RLS proving a parent and a teacher cannot write · **Demo:** fill Sunday for Class 6 – A on a phone in under two minutes; a parent's write attempt is refused by RLS.

**Part 3 — Clash detection and overrides** · `checkTimetableClash` used live in the sheet, teacher/room partial unique indexes, `timetable_clash_overrides` with a mandatory reason, clash banner and links to the conflicting slot · tests: unit matrix over teacher/room/section clash cases including double periods and break periods; integration proving an override is recorded and audited · **Demo:** try to book Mr. Rahman in two sections at Sunday period 3 and be refused with the conflict named; then override with a reason and see the audit event.

**Part 4 — Copy tools and publish** · copy-day, copy-from-section with pre-flight clash reports, publish with supersede semantics and `effective_from`, `timetable.published` notification, versions screen · tests: integration proving publishing supersedes correctly and that past dates resolve to the old version · **Demo:** build Sunday, copy it to four days, publish from next Sunday, and see last week still showing the old routine.

**Part 5 — Teacher view, room view, workload and free-teacher query** · `/app/timetable/me` with Now/Next, teacher grid, room grid, workload table, `GET /api/timetable/free-teachers` combining slots with F-AC-04 absence · tests: timezone tests for Now/Next across period boundaries and holidays; free-teacher query correctness with leave data · **Demo:** a teacher opens the app at 10:05 and sees "Now: Class 8 – B · Room 109"; the office asks who is free at period 3 and gets a ranked list.

**Part 6 — ICS export, exceptions and print** · ICS generation with `RRULE` + `EXDATE` from F-AC-11, signed revocable subscription URLs, `timetable_exceptions` overlay in every view, A4 landscape routine PDFs per section and per teacher with the school header, print-queue hand-off · tests: ICS golden-file test validated by an ICS parser, including holidays as EXDATEs and a moved period as a one-off event; PDF snapshot · **Demo:** subscribe a Google Calendar to a teacher's routine, declare a holiday, and watch that day disappear from the calendar.

## 9. Acceptance criteria

1. **Given** `working_days = [6,0,1,2,3,4]` (Sat–Thu), **when** any timetable screen renders, **then** exactly those six day tabs appear in the school's order, Sunday included, and Friday is absent.
2. **Given** a Sunday-start school, **when** a slot is created on Sunday, **then** it saves with `day_of_week = 0` — no enum rejects it (the prototype's defect).
3. **Given** Mr. Rahman teaches Class 7 – B at Sunday period 3, **when** an admin picks him for Class 6 – A at Sunday period 3, **then** the sheet shows the clash inline before saving, and saving without an override is refused with `TEACHER_CLASH`.
4. **Given** the same clash, **when** the admin taps Override and types a reason, **then** the slot saves, a `timetable_clash_overrides` row exists with the reason, and an audit event records who overrode what.
5. **Given** Room 204 is booked for Sunday period 3, **when** another section is assigned the same room and period, **then** `ROOM_CLASH` is returned; **when** the room is the hall and `allow_shared_hall` is true, **then** it saves.
6. **Given** a section with a slot at Sunday period 3, **when** a second slot is created for the same section, day and period, **then** it is refused with `SECTION_CLASH` and no override is offered.
7. **Given** a completed Sunday, **when** the admin copies it to Monday–Thursday, **then** a pre-flight report lists the slots to be created and any clashes, and only non-clashing slots are created unless overridden.
8. **Given** a draft version with two unresolved clashes, **when** Publish is attempted, **then** it fails with `UNRESOLVED_CLASHES` listing both.
9. **Given** a published version effective 1 March and a new one effective 1 April, **when** the timetable for 15 March is requested, **then** the March version is returned and the April version is invisible.
10. **Given** a teacher at 10:05 on a school day, **when** they open the app, **then** the Now/Next card shows the correct current and next period computed in Asia/Dhaka; **given** the same moment on a declared holiday, **then** it shows the next school day's first period instead.
11. **Given** a teacher's ICS subscription and a holiday declared for 26 March, **when** the feed is fetched, **then** 26 March appears as an `EXDATE` and no event is generated for it.
12. **Given** an ICS subscription token, **when** it is revoked, **then** subsequent fetches return `REVOKED` and the calendar stops updating.
13. **Given** a parent, **when** they open their child's timetable, **then** they see the published version for that section and cannot see any other section, and any write attempt is refused by RLS.
14. **Given** a teacher, **when** they call `upsertTimetableSlot` directly, **then** both the permission check and RLS refuse it (the prototype allowed anyone, including parents, to delete slots).
15. **Given** Mathematics has 5 slots and `section_subjects.periods_per_week = 6`, **when** the section page renders, **then** it shows "Mathematics 5/6 · one period short".
16. **Given** a teacher on approved leave on 12 March, **when** the office queries free teachers for 12 March period 3, **then** that teacher is excluded from the ranked list.
17. **Given** an admin on a 360×800 phone, **when** they add three slots to a day, **then** every control including Save is within the thumb zone and the desktop week grid is never rendered at that width.

## 10. Tests

- **Unit (`packages/domain`)**: `workingDayTabs(workingDays, firstDay)`, `clashKinds(slot, existing[])` across teacher/room/section/double/break combinations, `periodsPerWeek`, `scheduledMinutes`, `nowAndNext(now, bellPeriods, workingDays, holidays, tz)` across every boundary (start of period, end of period, break, after last period, holiday, weekend), `effectiveVersionFor(date, versions)`, `buildIcs(slots, exceptions, holidays, tz)` golden files.
- **DB (pgTAP)**: isolation and escalation for all five tables (explicitly: teacher and parent cannot insert/update/delete a slot); the bell-period exclusion constraint; the three uniqueness indexes including the partial teacher/room ones; `day_of_week` accepts 0–6 and rejects others; `workspace_id` immutability; published-version write refusal.
- **Integration**: `upsertTimetableSlot` for each clash error; `overrideClash` writes the override and the audit event; `copyTimetableDay` pre-flight vs commit consistency; `publishTimetableVersion` supersede semantics and `UNRESOLVED_CLASHES`; `GET /api/timetable/free-teachers` against fixtures with leave and existing covers.
- **E2E (360×800 and 1280×800, axe)**: `build-a-day-on-phone`, `clash-blocked-then-overridden`, `publish-and-view-past-date`, `teacher-now-next`, `ics-subscribe-and-holiday-exdate` (feed parsed by `ical.js` in the test). Axe clean on the section timetable, slot sheet and teacher grid.
- **Contract test**: the ICS output is validated against RFC 5545 by a parser, not by string comparison alone.
- **Performance budgets**: section timetable load < 350 ms for 8 periods × 6 days; teacher grid for 60 teachers × 48 cells < 600 ms; `checkTimetableClash` p95 < 80 ms (it fires on every keystroke-equivalent change); ICS for a full year (≈ 1,400 expanded events before RRULE compression) generated in < 500 ms.

## 11. Open questions

1. **Fortnightly / alternating weeks** (A-week, B-week). Assumed out of scope: BD schools almost universally run a fixed weekly routine. If needed, `timetable_slots.week_parity` is an additive column and one grid toggle.
2. **Automatic timetable generation** (constraint solver). Assumed out of scope for v1; the copy tools plus live clash detection cover the practical need. A generator would sit on top of the same tables.
3. **Per-shift bell schedules.** Modelled via `bell_schedules.applies_to_shift`, but v1 ships one default schedule per school. Assumed adequate until a two-shift school asks.
4. **Ramadan / exam-period schedules.** Modelled via `effective_from`/`effective_to` on `bell_schedules` and timetable versions. Assumed: the admin creates a version, publishes it for the period and publishes the regular one again afterwards.
5. **Whether break periods should be section-specific** (different tiffin times per wing). Assumed no: breaks come from the bell schedule for the whole school.
6. **Student-level timetables for optional subjects** (a Class 9 student taking Higher Math while others take Agriculture in the same slot). Assumed: v1 renders the section's slot and lists both options; a true per-student timetable needs a student↔section_subject elective table, which is flagged for F-AC-01/02 if schools ask.
