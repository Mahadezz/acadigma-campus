# F-AC-06 — Exams, marks, grading, GPA and results

|                  |                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                                                                                     |
| Status           | planned                                                                                                                                                                                                       |
| Owner branch     | `feat/academics-exams-marks`                                                                                                                                                                                  |
| Depends on       | F-AC-01 (years, terms, sections, section_subjects), F-AC-02 (students, enrollments), F-AC-03 (attendance, for the eligibility warning), F-AC-11 (calendar, for exam dates), F-OP-06 (PDF/print)               |
| Plan             | `docs/plan/ROADMAP.md` chunk 5                                                                                                                                                                                |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (Mark vs Grade, Exam), §3 features 28–35, 60, §4.1 steps 6–8, §4.4, §5 (all grading formulas), §6 items 14, 15, 20–22, 24, 25, 27, 42, 48, §7 Q4, Q7 |

## 1. Purpose

This is the feature parents judge the school by. A school schedules an exam per term, lists the subjects and papers with their dates and full marks, teachers enter marks on a phone or a desktop grid, the system computes subject percentage, letter, grade point, **GPA on the Bangladesh 5.00 scale**, pass/fail and **class rank in SQL**, an admin publishes the result, and parents see a mark sheet that says exactly the same thing the teacher's screen says. "Done": a teacher enters 40 students × 1 subject in under two minutes without losing work when the signal drops; an admin publishes Class 6's final result and every parent's portal updates at once; the printed mark sheet matches the portal digit for digit.

**Base44 intent vs reality.** Marks existed twice (`Mark`, live; `Grade`, a dead earlier draft with no tenant and no RLS) and were **not linked to exams at all** — `Exam.status = 'graded'` was a string a button cycled, and the cycle _wrapped_, so one extra tap sent a graded exam back to "upcoming". The grade letter was implemented **four independent times**, and one of them — the parent portal — used a **different scale**, so the same 72 % showed as "B+" to the teacher and "C" to the parent. The student average was computed as an unweighted mean of percentages on the profile and as a mark-weighted total on the report card, giving two different "averages" for one child. There was **no GPA, no grade points, no pass mark, no subject weighting, no rank, no term weighting and no promotion rule** anywhere in the codebase. The marks grid saved with one sequential request per student and no error handling. The term selector silently omitted "Mid Term", making those marks unreachable. The report card printed a hardcoded "TeachFlow Academy" and its AI comments lived in React state and were lost on refresh. PRODUCT-DECISIONS 2.4 and 2.7 replace all of it: one per-school `grade_scales` table with BD defaults, GPA as the mean of subject grade points with F → 0, rank by GPA then total, weighting across exams per academic year, and `exams → exam_subjects → marks` as the only path.

## 2. Roles and permissions

| Action                                                           | Permission key                       | owner | admin | teacher                                                                              | staff | parent                        | platform |
| ---------------------------------------------------------------- | ------------------------------------ | ----- | ----- | ------------------------------------------------------------------------------------ | ----- | ----------------------------- | -------- |
| View exam schedule                                               | `exams.read`                         | yes   | yes   | yes                                                                                  | yes   | own children (published only) | no       |
| Create/edit an exam and its subjects                             | `exams.write`                        | yes   | yes   | no                                                                                   | no    | no                            | no       |
| Upload a question paper (private)                                | `exams.paper.write`                  | yes   | yes   | primary teacher of that section_subject                                              | no    | no                            | no       |
| Enter/edit marks                                                 | `marks.write`                        | yes   | yes   | primary or assistant teacher of that section_subject, while the entry window is open | no    | no                            | no       |
| Edit marks after the entry window closes                         | `marks.write_late`                   | yes   | yes   | no                                                                                   | no    | no                            | no       |
| Lock / unlock an exam subject                                    | `marks.lock`                         | yes   | yes   | no                                                                                   | no    | no                            | no       |
| View a section's marks                                           | `marks.read`                         | yes   | yes   | any teacher of that section                                                          | yes   | no                            | no       |
| View a student's results                                         | `results.read`                       | yes   | yes   | class teacher + subject teachers                                                     | yes   | own children (published only) | no       |
| Compute and preview results / rank                               | `results.compute`                    | yes   | yes   | class teacher (preview only)                                                         | no    | no                            | no       |
| Publish / unpublish results                                      | `results.publish`                    | yes   | yes   | no                                                                                   | no    | no                            | no       |
| Configure grade scales, pass mark, GPA rules                     | `settings.grade_scale.write` (D-302) | yes   | yes   | no                                                                                   | no    | no                            | no       |
| Create an aggregate (term/annual) exam and set component weights | `grading.weights.write`              | yes   | yes   | no                                                                                   | no    | no                            | no       |
| Print mark sheets / tabulation sheet                             | `results.print`                      | yes   | yes   | class teacher                                                                        | yes   | own children                  | no       |

A teacher can only touch marks for section_subjects they are attached to, and only while that exam subject is unlocked — enforced by RLS, not by the UI.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table.

**`grade_scales`** — per school, versioned so a published result never changes retroactively: `name text` ("Bangladesh GPA 5.00"), `is_default bool`, `pass_mark numeric(5,2) default 33`, `fail_zeroes_gpa bool default true`, `optional_subject_rule optional_rule` (`none|bd_fourth_subject`), `optional_bonus_threshold numeric(3,2) default 2.00`, `gpa_decimals int default 2`, `effective_from date`, `is_active bool`.
Index: `unique (workspace_id, name)`, partial `unique (workspace_id) where is_default`.

**`grade_scale_bands`** — `grade_scale_id`, `letter text`, `min_pct numeric(5,2)`, `max_pct numeric(5,2)`, `grade_point numeric(3,2)`, `is_fail bool`, `sort int`, `colour text`.
Index: `unique (grade_scale_id, letter)`; exclusion constraint preventing overlapping `[min_pct, max_pct]` ranges within a scale; a check that the bands cover 0–100 with no gaps.
**BD default rows** (PRODUCT-DECISIONS 2.4): A+ 80–100 → 5.00 · A 70–79.99 → 4.00 · A− 60–69.99 → 3.50 · B 50–59.99 → 3.00 · C 40–49.99 → 2.00 · D 33–39.99 → 1.00 · F 0–32.99 → 0.00 (`is_fail`).

**`exams`** — `academic_year_id`, `term_id null` (null for an annual aggregate), `name text` ("Half-Yearly Examination 2026"), **`kind exam_kind` (`regular|aggregate`)**, `exam_type exam_type` (`class_test|midterm|term_final|annual|model_test|practical|other`), `starts_on date null`, `ends_on date null`, `status exam_status` (`draft|scheduled|in_progress|marks_entry|marks_locked|published|archived`), `grade_scale_id` (snapshotted at creation), `instructions text`, `published_at`, `published_by`, `result_note text`.
Indexes: `index (workspace_id, academic_year_id, term_id)`, `index (workspace_id, status)`, `index (workspace_id, kind)`. **No status cycling button** — transitions are explicit and one-directional except for documented admin reversals (§5.12).

> **Report cards are always per exam.** A **term report card** and an **annual report card** are produced from an exam with `kind = 'aggregate'` whose marks are _computed_, not entered: its `exam_subjects` mirror the component exams' papers, and its `marks` are derived from the component exams by the per-academic-year weighting of PRODUCT-DECISIONS 2.4. This keeps one code path for grading, GPA, ranking, publishing, mark sheets and the parent portal — an aggregate is an exam like any other, it simply has no marks-entry screen and `exam_subjects.status` goes straight to `locked` when it is computed.

**`exam_components`** — the weighting edges of an aggregate exam (this **replaces** a separate `exam_weights` table): `aggregate_exam_id references exams`, `component_exam_id references exams`, `weight_bp int` (**basis points**, per ARCHITECTURE §4 — 3000 = 30 %), `sort int`.
Indexes: `unique (aggregate_exam_id, component_exam_id)`, `index (workspace_id, component_exam_id)`. Checks: `weight_bp between 0 and 10000`; `component_exam_id <> aggregate_exam_id`; a trigger refuses a component whose `kind = 'aggregate'` (no nesting in v1), requires components to share the aggregate's `academic_year_id`, and **warns without blocking when `Σ weight_bp <> 10000`**.

**`exam_sections`** — which sections sit this exam: `exam_id`, `section_id`.
Index: `unique (exam_id, section_id)`.

**`exam_subjects`** — the paper: `exam_id`, `section_subject_id`, `section_id` (denormalised), `subject_id` (denormalised), `exam_date date null`, `starts_at time null`, `duration_minutes int null`, `room_id null`, `full_marks numeric(6,2)`, `pass_marks numeric(6,2)`, `has_components bool default false`, `status exam_subject_status` (`pending|entering|submitted|locked`), `entry_opens_on date null`, `entry_closes_on date null`, `entered_by uuid null`, `entered_at timestamptz null`, `locked_at timestamptz null`, `paper_file_id uuid null`, `invigilator_id uuid null`.
Indexes: `unique (exam_id, section_subject_id)`, `index (workspace_id, exam_id, section_id)`.

**`exam_subject_components`** — optional split (Written 70 / MCQ 20 / Practical 10), because BD schools mark papers in parts: `exam_subject_id`, `name text`, `full_marks numeric(6,2)`, `pass_marks numeric(6,2) null`, `sort int`.
Index: `unique (exam_subject_id, name)`; check `Σ full_marks = exam_subjects.full_marks` (deferred constraint or trigger).

**`marks`** — one per student per exam_subject: `exam_subject_id`, `student_id`, `enrollment_id`, `obtained numeric(6,2) null`, `component_marks jsonb null` ({component_id: value}), `status mark_status` (`entered|absent|exempt|withheld`), `remarks text null`, `entered_by`, `entered_at`, `updated_by`, `updated_at`.
Indexes: `unique (exam_subject_id, student_id)`, `index (workspace_id, student_id)`, `index (workspace_id, exam_subject_id)`.

**`results`** — the computed, publishable row per student **per exam** (an aggregate exam is what makes a term or annual report card): `exam_id not null`, `academic_year_id`, `term_id null`, `scope result_scope` (`exam|term|annual`, **derived**: a `regular` exam → `exam`; an `aggregate` with a `term_id` → `term`; an `aggregate` without one → `annual`), `student_id`, `section_id`, `total_obtained numeric(8,2)`, `total_full numeric(8,2)`, `percentage numeric(5,2)`, `gpa numeric(4,2)`, `gpa_without_optional numeric(4,2) null`, `letter text`, `result_status result_status` (`pass|fail|incomplete|withheld`), `failed_subjects int`, `section_rank int null`, `grade_rank int null`, `computed_at timestamptz`, `grade_scale_id`, `published bool default false`, `published_at`, `frozen_payload jsonb null` (the full mark sheet as published).
Indexes: `unique (student_id, exam_id)`, `index (workspace_id, section_id, exam_id)`, `index (workspace_id, academic_year_id, scope)`.

**`result_subject_lines`** — the mark-sheet rows: `result_id`, `subject_id`, `subject_name` (snapshotted), `full_marks`, `obtained`, `percentage`, `letter`, `grade_point`, **`subject_kind subject_kind`** (`compulsory|optional_fourth`, **snapshotted** at compute time per §5.4 so a catalogue edit cannot change an issued result), `counts_in_gpa bool`, `status` (`entered|absent|exempt`), `components jsonb null`.
Index: `unique (result_id, subject_id)`; partial `unique (result_id) where subject_kind = 'optional_fourth'` — at most one 4th subject per result.

_(Weighting across exams lives in `exam_components` above — there is no separate `exam_weights` table.)_

**`report_comments`** — persisted teacher/AI comments (PRODUCT-DECISIONS 6.6): `result_id`, `subject_id null`, `author_id`, `body text`, `source comment_source` (`teacher|ai`), `approved bool default false`, `approved_by`, `approved_at`.
Index: `index (workspace_id, result_id)`.

**`exam_seat_plans`** — one per exam (or per exam date, for multi-day exams), R1: `exam_id`, `exam_date date null`, `room_ids uuid[]`, `mixing_rule seat_mixing_rule` (`by_section|mixed_sections|roll_interleave`), `generated_at`, `generated_by`, `locked bool default false`.
Index: `unique (exam_id, exam_date)`.

**`exam_seat_assignments`** — the rows a printed **আসন বিন্যাস** (seat plan) renders: `seat_plan_id`, `student_id`, `room_id`, `seat_no text`, `section_id` (denormalised, so a mixed-section room still shows each student's home section), `bench_no text null`.
Index: `unique (seat_plan_id, student_id)`, `unique (seat_plan_id, room_id, seat_no)`.

**`invigilation_duties`** — the **কক্ষ পরিদর্শক তালিকা** (invigilation duty roster), generated from rooms + timetable + staff availability: `exam_id`, `exam_subject_id null` (null = whole-day duty), `room_id`, `staff_id references workspace_members`, `role invigilation_role` (`chief|assistant|reserve`), `starts_at timestamptz`, `ends_at timestamptz`, `generated_at`, `generated_by`, `confirmed_at timestamptz null` (the assigned staff member acknowledges), `swapped_from_staff_id uuid null`.
Index: `index (workspace_id, exam_id, room_id)`, `index (workspace_id, staff_id, starts_at)` (so a teacher's own duty list and clash-with-teaching-load checks are one query).

**`answer_script_custody_events`** — a tracked chain of custody for the physical paper: `exam_subject_id`, `room_id null`, `batch_label text` (e.g. "6-A Math scripts, 1 of 2"), `script_count int`, `event custody_event` (`collected_from_room|handed_to_examiner|returned_by_examiner|filed|handed_to_office|lost`), `from_staff_id uuid null`, `to_staff_id uuid null`, `occurred_at timestamptz`, `note text null`, `recorded_by`.
Index: `index (workspace_id, exam_subject_id, occurred_at)`. A script batch's custody chain must start `collected_from_room` and end `filed` (or `handed_to_office`) before the exam subject can be locked — enforced by §5.16 and by `submitExamSubject`/`lockExamSubject` (§4.11).

**Enums**: `exam_kind`, `exam_type`, `exam_status`, `exam_subject_status`, `mark_status`, `result_scope`, `result_status`, `optional_rule`, `subject_kind` (`compulsory|optional_fourth`; declared alongside `subjects` in F-AC-01), `comment_source`, `seat_mixing_rule`, `invigilation_role`, `custody_event`.

**Tables owned by this feature** (F-OP-07 specifies only the _settings screens_ that edit them): `grade_scales`, `grade_scale_bands`. `academic_years` and `terms` are owned by F-AC-01; `holidays` by F-AC-11.

**RLS in words.** `grade_scales` / `grade_scale_bands` / `exam_components`: read by all active members; write by owner/admin. `exams` / `exam_sections` / `exam_subjects`: read by owner/admin/teacher/staff; **parents read only `exams` rows whose status is `published`, and only for their children's sections**, through the parent view. Write by owner/admin, except `paper_file_id`, which the section_subject's primary teacher may set. `marks`: read by owner/admin/staff and by teachers attached to that `section_subject` (primary or assistant) — a teacher of another subject cannot read a colleague's marks; **parents never read `marks` directly**, they read `result_subject_lines` of published results. Write on `marks` requires the teacher attachment **and** `exam_subjects.status <> 'locked'` **and** `current_date between entry_opens_on and entry_closes_on` (admins bypass the window and stamp the row). `results` / `result_subject_lines`: written only by the SQL compute function (service role or a `security definer` routine callable by owner/admin); read by owner/admin/staff/class teacher, and by **parents only when `published = true`**. `report_comments`: the author and owner/admin may read and write; parents read only rows with `approved = true` on a published result. `workspace_id` immutable everywhere.

**Private files.** `exam_subjects.paper_file_id` (question papers) are `files` with `visibility='private'`, readable only by owner/admin and the paper's subject teacher before the exam date, with `file_access_log` written on every access — a leaked question paper is the single most damaging file-exposure in a school product.

## 4. Workflows

**4.1 Schedule an exam.**
_Trigger:_ admin → `/app/exams` → "New exam".
_Steps:_ name, type, term (defaults to current), date range, which sections sit it (default: all in the year), and — the step the prototype never had — **the subject list**: for each selected section the system pre-fills one `exam_subjects` row per `section_subjects` row, with full marks from `section_subjects.full_marks`. The admin sets dates/times per paper in a compact list, or uses "Same date for all Class 6 papers". Save as `draft` → **Schedule** publishes the timetable to teachers and to the calendar (F-AC-11).
_Outcome:_ exam + exam_sections + exam_subjects; calendar events created.
_Notifications:_ `exam.scheduled` to teachers of the affected section_subjects and (once published) `exam.upcoming` reminders to parents 3 days before per PRODUCT-DECISIONS 1.11.
_Audit:_ `exam.created`, `exam.scheduled`.
_Failures:_ a section with no `section_subjects` → the wizard says so and links to F-AC-01; overlapping papers for one section on one date/time → a warning with the clash listed (not a block — schools do run two papers in a day).

**4.2 Enter marks (the two-minute path).**
_Trigger:_ teacher's dashboard card "Marks due: Class 6 – A · Mathematics · closes in 2 days", or `/app/marks`.
_Steps (phone):_ the screen is a **vertical list**, not a spreadsheet: one 72 px row per student showing roll, name and a large numeric input with `inputmode="decimal"`. The keyboard stays up; **Enter/Next advances to the next student** and scrolls it into view. A sticky bottom bar shows "24 of 40 entered · avg 63 %" and one **Save** button. Chips above the list: "Absent" and "Exempt" toggles applied to the focused row (two taps, no picker). Autosave fires every 10 s and on blur into a local draft; Save commits.
_Steps (desktop):_ the same data as a grid with arrow-key navigation, paste-from-clipboard of a column of numbers (validated per cell), and a running distribution histogram on the right.
_Outcome:_ one **bulk upsert** of all changed rows in a single statement (the prototype issued one sequential request per student); `exam_subjects.status` moves `pending → entering → submitted`.
_Notifications:_ `marks.submitted` to admins when a paper is submitted; `marks.due` reminder 1 day before `entry_closes_on`.
_Audit:_ `marks.entered` (paper-level, with a count) on first submission; `marks.changed` (before/after, per student) on every later edit.
_Failures:_ a value above `full_marks` or below 0 → inline field error, the row is not saved, the rest are; a locked paper → read-only with "Request unlock"; offline → the same IndexedDB queue and idempotency contract as F-AC-03, keyed by (exam_subject_id, client_session_id).

**4.3 Component marks.** When `has_components`, the row expands to one input per component (Written 70 / MCQ 20 / Practical 10) and `obtained = Σ components`, with each component validated against its own full marks. A component below its `pass_marks` can flag "component fail" if the school uses that rule (§5.6).

**4.4 Lock and compute.**
_Trigger:_ admin → exam → "Lock marks entry".
_Steps:_ the system reports completeness ("11 of 12 papers submitted · Class 6 – B Science missing 4 students"), then locks. **Compute results** runs the SQL function `app.compute_results(exam_id)` which writes `results` and `result_subject_lines` for every student in every section of the exam and assigns ranks.
_Outcome:_ previewable results with rank, GPA and pass/fail, still `published = false`.
_Audit:_ `exam.locked`, `results.computed` with counts.
_Failures:_ missing marks → students get `result_status = 'incomplete'` and are excluded from rank (§5.10) rather than silently scoring zero; an admin can force-treat missing as absent with one audited action.

**4.5 Publish results to parents.**
_Trigger:_ admin → exam → "Publish results", after previewing.
_Steps:_ a confirmation sheet lists what parents will see and lets the admin withhold individual students (fees, incomplete). On confirm, each `results` row gets `published = true`, `published_at`, and a `frozen_payload` snapshot of the whole mark sheet (school name, section name, subject names, bands, GPA) so a later change to a subject name or grade scale can never alter an issued result.
_Outcome:_ `/family` shows the result; the mark sheet PDF becomes downloadable.
_Notifications:_ `result.published` to every linked guardian and to class teachers.
_Audit:_ `results.published` with the student count and any withheld list.
_Failures:_ publishing with `incomplete` results → a confirm step naming them; unpublishing is possible (`results.unpublished`, audited, parents notified) but the frozen payload is retained.

**4.6 Term and annual report cards (aggregate exams).**
_Trigger:_ admin → `/app/exams` → "New aggregate result" (or "Build annual result" from the year settings).
_Steps:_ name it ("Annual Result 2026"), choose scope (a term, or the whole year), pick the **component exams** and set each one's weight — a stepper in percent that stores `weight_bp`, with a live "sum = 100 %" indicator that warns but never blocks. Choose the sections. The system creates the aggregate exam and one `exam_subjects` row per subject the components share.
_Outcome:_ **Compute** derives every `marks` row from the components by §5.7, sets the aggregate's `exam_subjects.status = 'locked'`, then runs the ordinary `app.compute_results(exam_id)` — so the aggregate produces `results` + `result_subject_lines` + ranks through exactly the same code as a regular exam, and its report card is an ordinary mark sheet.
_Notifications:_ `result.published` on publish, as for any exam.
_Audit:_ `exam.aggregate.created`, `exam.aggregate.computed` with the component list and weights, `results.computed`.
_Failures:_ a component exam whose marks are not locked → `COMPONENT_NOT_LOCKED` listing them; a component of `kind = 'aggregate'` → refused (no nesting); recomputing after a component is corrected is allowed and overwrites the derived marks, but only while the aggregate is unpublished.
The tabulation sheet (all students × all subjects for a section) prints from these same rows.

**4.7 Mark sheet and tabulation printing.** Per student: an A4 mark sheet with the school header from `school_profiles` (never a hardcoded academy name — the prototype's §6.21), subject lines, GPA, rank, attendance summary from F-AC-03, the class teacher's approved comment, and a signature block. Bulk: one PDF for the whole section, and a landscape **tabulation sheet**. Both go to `files` and optionally `print_jobs` with copies = student count.

**4.8 Comments.** A class teacher writes a comment per result; "Suggest with AI" calls the AI adapter through the credit flow (PRODUCT-DECISIONS 3.3) and fills the same field. **Comments are stored in `report_comments` and require `approved = true` before a parent can see them** (PRODUCT-DECISIONS 6.6) — the prototype held them in React state and lost them on refresh.

**4.9 Phone specifics.** Marks entry keeps the numeric keypad up for the whole pass; the Save button sits above the keyboard in a sticky bar; absent/exempt are chips, not a dropdown; the student list never horizontally scrolls. The result preview for a section is a card list (name, GPA, rank, pass/fail) sorted by rank, with a search box.

**4.10 Seat plan (আসন বিন্যাস) and invigilation duty roster (কক্ষ পরিদর্শক তালিকা).** _Trigger:_ admin → exam → "Generate seat plan" / "Generate invigilation roster", once rooms and the exam timetable exist. _Steps:_ the seat plan generator takes the sections sitting the exam and the selected rooms, applies the chosen `mixing_rule` (by section, mixed across sections, or roll-number interleave — the anti-copying arrangement most BD schools actually want), and assigns one seat per student, filling `exam_seat_assignments`. The invigilation roster generator reads `rooms`, the exam's per-paper timetable and `workspace_members` (staff), and assigns chief/assistant/reserve invigilators per room per paper, avoiding a teacher's own subject/section where possible and never double-booking a staff member across two rooms in the same slot. Both are editable by drag-and-drop before locking. _Outcome:_ both print as A4 PDFs — the seat plan per room (room number, student names/rolls/seats) and the roster per day (room, time, paper, invigilator names) — through F-OP-06, and go to `print_jobs` when requested. _Audit:_ `exam.seat_plan.generated`, `exam.invigilation_roster.generated`. _Failures:_ insufficient room capacity for the sections selected → the generator reports the shortfall and refuses to silently overflow a room; a staff clash (already invigilating or already teaching a paper in that slot) → listed and must be resolved before locking.

**4.11 Answer-script custody.** _Trigger:_ automatically prompted when an exam paper's sitting ends (from the exam timetable), or manually from the exam subject's detail screen. _Steps:_ the invigilator (or admin) records `collected_from_room` with a script count; the batch is then handed to the subject teacher for marking (`handed_to_examiner`), and on completion `returned_by_examiner`, then `filed` (or `handed_to_office`). Any deviation from that chain, or a batch marked `lost`, surfaces on an admin "custody exceptions" list. _Outcome:_ a printable custody log per exam subject, showing every hand-off with who, when and how many scripts. _Audit:_ `answer_script.custody_event` per event. _Failures:_ `submitExamSubject` (§4.2) refuses to lock a paper whose custody chain has not reached `filed` (or `handed_to_office`) with `CUSTODY_INCOMPLETE`, naming the missing step — a physical exam paper is not "done" just because marks were typed in.

## 5. Business rules and calculations

**5.1 Subject percentage.**

```
subject_pct = round(100 * obtained / full_marks, 2)
```

`status='absent'` → `obtained` treated as 0 and the subject **counts** (it is a failure) unless the school sets `absent_counts_as_exempt`. `status='exempt'` → the subject is removed from both numerator and denominator everywhere (GPA, total, percentage) and prints as "—". `status='withheld'` → the whole result becomes `withheld`.

**5.2 Letter and grade point** come from the exam's snapshotted `grade_scale_id`: the band where `min_pct <= subject_pct <= max_pct`. Because the scale is snapshotted on the exam and again into `frozen_payload` at publish, a school changing its scale in June cannot alter March's result. **There is exactly one implementation** — `packages/domain/grading/scale.ts` and the SQL function `app.band_for(grade_scale_id, pct)` — with a parity test; the prototype had four, one of which disagreed with the other three on the parent's screen.

**5.3 GPA (Bangladesh rule).**

```
countable = subject lines where counts_in_gpa AND status <> 'exempt'
                             AND subject_kind = 'compulsory'        // the 4th subject is never countable
gpa_raw   = Σ grade_point(countable) / count(countable)
if fail_zeroes_gpa AND any countable line has is_fail   ->  gpa = 0.00
else                                                    ->  gpa = round_half_up(gpa_raw, gpa_decimals)   // 2 dp
```

`fail_zeroes_gpa` defaults **true** (PRODUCT-DECISIONS 2.4: "an F in any subject → GPA 0 per BD rule, configurable"). When the 4th-subject rule is on, §5.4 replaces this formula's final step; the `is_fail` check still considers **compulsory subjects only**.

**5.4 The Bangladesh 4th / optional subject rule** — `optional_subject_rule = 'bd_fourth_subject'`. This is the universal BD board rule and it is implemented **once**, in `packages/domain/grading/gpa.ts` and in the SQL GPA function, with a parity test:

```
compulsory = subject lines where subject_kind = 'compulsory'
             AND counts_in_gpa AND status <> 'exempt'
fourth     = the single line where subject_kind = 'optional_fourth' (if any)

bonus      = max(0, grade_point(fourth) - fourth_subject_bonus_threshold_gp)   // threshold 2.00

GPA = min( 5.00,
           round_half_up( ( Σ grade_point(compulsory) + bonus ) / count(compulsory),
                          gpa_decimals ) )
```

Three consequences that the rule makes explicit and that the code must honour:

- **A failing 4th subject never fails the student and never lowers the GPA.** The 4th subject is excluded from `failed_subjects`, from `result_status`, and from the `fail_zeroes_gpa` check in §5.3 — only _compulsory_ subjects can zero a GPA. A grade point at or below the threshold simply contributes `bonus = 0`.
- **The denominator is the count of compulsory subjects only.** The 4th subject is never added to it.
- **The result is capped at 5.00.**

`gpa_without_optional = round_half_up(Σ grade_point(compulsory) / count(compulsory), gpa_decimals)` is stored alongside, so the mark sheet can print both and a parent can see what the 4th subject added. The optional line always prints with its own letter, marked "(4th subject)".

**Modelling.** `subjects.subject_kind subject_kind` (`compulsory|optional_fourth`) is the catalogue default; `section_subjects.is_optional_fourth boolean` overrides it per section, because the same subject (Higher Mathematics, Agriculture) is compulsory in one section and the 4th subject in another. The effective value is `coalesce(section_subjects.is_optional_fourth, subjects.subject_kind = 'optional_fourth')`, snapshotted onto `result_subject_lines.subject_kind` at compute time so a later catalogue edit cannot change an issued result. The threshold lives **per academic year** as `academic_years.fourth_subject_bonus_threshold_gp numeric(3,2) default 2.00` (boards have changed it before), with `grade_scales.optional_bonus_threshold` kept only as the fallback when the year has none. A constraint allows **at most one** `optional_fourth` line per student per exam; a second one is a validation error at compute time (`MULTIPLE_FOURTH_SUBJECTS`).

Default `optional_subject_rule = 'none'` for internal school exams; schools preparing SSC/Dakhil candidates turn it on for the grades that need it.

**5.5 Totals and overall percentage.**

```
total_obtained = Σ obtained over non-exempt lines
total_full     = Σ full_marks over non-exempt lines
percentage     = round(100 * total_obtained / total_full, 2)
```

This is the **mark-weighted** overall percentage. The unweighted mean of subject percentages is _not_ computed or displayed anywhere, so the prototype's "two different averages for one child" cannot recur.

**5.6 Pass / fail.**

```
subject_pass = subject_pct >= band-derived pass OR obtained >= exam_subjects.pass_marks
               (pass_marks default = round(full_marks * grade_scales.pass_mark / 100), i.e. 33 %)
component_pass (only if use_component_pass) = every component >= its pass_marks
failed_subjects = count(countable lines where NOT subject_pass)
                  // countable excludes the 4th subject entirely (§5.4): a failed 4th
                  // subject is reported on the mark sheet but never fails the student
result_status   = 'fail'      if failed_subjects > 0
                = 'incomplete' if any countable line has no mark and none were forced to absent
                = 'withheld'   if any line is withheld
                = 'pass'       otherwise
```

**5.7 Aggregate exams: weighting across component exams.** An aggregate exam's marks are **computed**, never typed. For each of its `exam_subjects` (one per subject the components share, with `full_marks` taken from the aggregate's own paper row, default 100):

```
components = exam_components rows of the aggregate, joined to a component exam that
             has an exam_subject for subject s AND a mark row for this student
w_e        = exam_components.weight_bp for component exam e      (basis points)
pct_s      = Σ_e ( w_e * subject_pct(s, e) ) / Σ_e w_e
obtained_s = round_half_up( pct_s * full_marks_s / 100 , 2 )     // written into marks
```

- A component where the student is **`exempt`** is excluded from both sums (its weight does not count against them).
- A component where the student is **`absent`** contributes `subject_pct = 0` **with its full weight** — absence costs.
- A subject present in some components and missing from others uses only the components that carry it, renormalising over `Σ_e w_e` of those.
- If the aggregate has **no** `exam_components` rows, every `regular` exam in the same academic year (and, for a term aggregate, the same term) is included with equal weight, and the compute preview shows "weights not configured, using equal weights".
- `Σ weight_bp <> 10000` is a **warning, not a block** — the formula renormalises by `Σ_e w_e` regardless, so 3000/7000 and 30/70 give identical results.
  Example, BD-typical: 1st Term `3000`, 2nd Term `3000`, Final `4000`; or the PRODUCT-DECISIONS 2.4 example, 1st term `3000` / final `7000`.
  Once the derived `marks` exist, **every downstream step is the ordinary per-exam path** — §5.1 to §5.6 and §5.8 run unchanged on the aggregate exam, so GPA, pass/fail, rank, publishing and the mark sheet have exactly one implementation.

**5.8 Rank.** Computed in SQL, never in the browser:

```sql
rank() over (
  partition by section_id
  order by gpa desc, total_obtained desc, percentage desc, student_code asc
)
```

`rank()` gives standard competition ranking (1, 2, 2, 4). `section_rank` partitions by section; `grade_rank` partitions by `grade_level_id`. Students with `result_status in ('incomplete','withheld')` get `rank = null` and are listed after the ranked students. Ties are shown as "2 (tied)". The final tiebreaker on `student_code` exists only to make the ordering deterministic for tests; it never changes a rank value because `rank()` assigns equal ranks to equal keys before it.

**5.9 Exam eligibility warning.** On the exam roster and admit card, a student whose term-to-date attendance is below `attendance_policy.min_attendance_pct` (default 75) is flagged — a **warning, never a block** (PRODUCT-DECISIONS 2.2). The flag is informational on the result too.

**5.10 Incomplete handling.** A student missing marks in ≥ 1 countable subject is `incomplete`, excluded from rank, and their GPA is **not** computed (null), rather than being computed from partial data. The compute preview lists them so the office can chase the paper.

**5.11 Entry window.** `exam_subjects.entry_opens_on` defaults to the paper's `exam_date` and `entry_closes_on` to `exam_date + grading.entry_window_days` (default 7). Teachers may write only inside it; admins always, with the row stamped `updated_by` and an audit event.

**5.12 Status transitions** (explicit, non-cycling — the prototype's wrap-around bug):

```
exams:         draft → scheduled → in_progress → marks_entry → marks_locked → published → archived
               admin reversals allowed: published → marks_locked (unpublish, audited),
                                        marks_locked → marks_entry (unlock, audited, reason required)
exam_subjects: pending → entering → submitted → locked
```

Every reversal requires a reason and writes an audit event; no transition is available as a single unlabelled "advance" button.

**5.13 Rounding.** All percentages and GPAs use **round-half-up** at the stated precision, implemented once in `packages/domain/grading/round.ts` and as `app.round_half_up(numeric, int)` in SQL, with a parity test — because banker's rounding in Postgres vs JS rounding in the browser is exactly the kind of drift that makes a parent's mark sheet disagree with a teacher's screen by 0.01.

**5.14 Publication freeze.** `frozen_payload` stores the rendered mark-sheet data at publish time. Every parent-facing surface and every reprint reads the frozen payload when present. Recomputation after publication is possible but produces a new version and requires an explicit "republish" with a notification to guardians.

**5.15 Seat plan and invigilation generation.** Seat assignment is deterministic given `(exam_id, exam_date, mixing_rule, room_ids)`: `roll_interleave` orders students by section then interleaves rolls across rooms (1st student room A, 2nd room B, …) specifically to break up copying pairs; `mixed_sections` shuffles within a fixed seed stored on the plan so a regeneration is reproducible; `by_section` keeps each room to one section when room capacity allows. Invigilator assignment excludes, where the roster of eligible staff allows it, a teacher invigilating their own subject or their own section's room, and never assigns one staff member to two rooms with overlapping `starts_at`/`ends_at`. Locking a seat plan or roster (`locked = true`) freezes it for printing; a change afterwards requires an explicit unlock and re-print, audited.

**5.16 Answer-script custody gate.** `exam_subjects.status` cannot move to `locked` while any `answer_script_custody_events` chain for that exam subject has not reached a terminal state (`filed` or `handed_to_office`) — `lockExamSubject` and `submitExamSubject` both check this and return `CUSTODY_INCOMPLETE` naming the missing hand-off. A `lost` event never auto-resolves; it stays on the admin "custody exceptions" list until an admin manually records a resolution (found, or a formal loss report), audited as `answer_script.custody.lost` / `.resolved`.

## 6. UI

| Screen                | Route                                                           | 360×800                                                                                              | ≥1024                                                         | Primary action   | Empty                                     | Loading          | Error                                                                          |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------- | ----------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| Exams list            | `/app/exams`                                                    | Cards grouped by term with status chips and date ranges                                              | Table + filters (term, type, status)                          | New exam         | "No exams this term → schedule one"       | 5 skeleton cards | Retry                                                                          |
| Exam detail           | `/app/exams/[id]`                                               | Tabs: Papers · Marks progress · Results · Settings                                                   | Same as columns                                               | Contextual       | "No papers → add subjects"                | Skeleton         | Retry                                                                          |
| Paper editor          | sheet                                                           | Date, time, duration, room, full/pass marks, components, invigilator                                 | Dialog                                                        | Save             | n/a                                       | Spinner          | Field errors                                                                   |
| Marks entry           | `/app/marks/[examSubjectId]`                                    | 72 px rows, big numeric input, keypad stays up, Absent/Exempt chips, sticky "24/40 · Save"           | Grid with arrow-key nav, paste column, distribution histogram | Save             | "No students enrolled"                    | Roster skeleton  | Per-row inline errors; valid rows still save; offline → queued                 |
| Marks progress        | `/app/exams/[id]?tab=progress`                                  | Paper rows with "12/40 entered" bars and Lock buttons                                                | Table with per-paper status and teacher                       | Lock entry       | "No papers"                               | Skeleton         | Retry                                                                          |
| Results preview       | `/app/exams/[id]/results`                                       | Ranked card list (name, GPA, rank, pass/fail), search, filter "incomplete"                           | Table with all columns + a GPA distribution chart             | Publish          | "Compute results first"                   | Compute progress | Compute failure with the reason                                                |
| Student result        | `/app/students/[id]?tab=results`                                | Exam picker + subject lines + GPA ring + rank chip                                                   | Two-column with a term-over-term trend                        | Print mark sheet | "No published results"                    | Skeleton         | Retry                                                                          |
| Grade scale settings  | `/app/settings/grade-scale`                                     | Band rows with min/max/point, live preview ("72 % → A")                                              | Two-column with a full preview table                          | Save             | "Use the Bangladesh default" one-tap seed | Skeleton         | Overlap/gap errors highlighted                                                 |
| Aggregate builder     | `/app/exams/aggregate/new` and `/app/exams/[id]?tab=components` | Component exam list with % steppers (stored as `weight_bp`) and a live sum indicator; Compute button | Two-column: components left, derived preview right            | Compute          | "Pick component exams"                    | Skeleton         | Sum ≠ 100 % warning (non-blocking); `COMPONENT_NOT_LOCKED` lists the offenders |
| Tabulation sheet      | `/app/exams/[id]/tabulation`                                    | Horizontally scrollable with a frozen name column                                                    | Full grid                                                     | Print            | "Compute results first"                   | Skeleton         | Retry                                                                          |
| Seat plan             | `/app/exams/[id]/seat-plan`                                     | Room-by-room list, drag-to-swap a seat, mixing-rule picker                                           | Room grid layout                                              | Generate / Print | "Pick rooms first"                        | Skeleton         | Capacity-shortfall / lock retry                                                |
| Invigilation roster   | `/app/exams/[id]/invigilation`                                  | Day-by-day duty cards per room, swap-staff sheet                                                     | Table: room × slot × invigilator                              | Generate / Print | "Timetable not set"                       | Skeleton         | Staff-clash list, lock retry                                                   |
| Answer-script custody | `/app/exams/[examSubjectId]/custody`                            | Timeline of hand-off events, big "Record hand-off" button                                            | Table with a custody-exceptions filter                        | Record hand-off  | "No scripts collected yet"                | Skeleton         | `CUSTODY_INCOMPLETE` banner blocks lock                                        |

`packages/ui`: `MarksEntryList` (keypad-persistent numeric rows), `MarksGrid` (desktop), `StatusChip`, `ProgressBar`, `RankBadge`, `GpaRing`, `BandEditor`, `DistributionChart`, `FrozenNotice`, `ConfirmSheet`, `PrintSheet`.

## 7. Server contracts

| Action / handler                        | Input schema (Zod)                                                                                                                       | Output                                                         | Errors                                                                                                         | Idempotency                      | Rate limit |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| `createExam`                            | `CreateExamInput` {academicYearId, termId, name, examType, startsOn, endsOn, sectionIds[], autoCreateSubjects: true}                     | `Exam` with `examSubjects`                                     | `YEAR_CLOSED`, `NO_SECTION_SUBJECTS`, `NAME_TAKEN`                                                             | key required                     | 60/h       |
| `updateExam`                            | `UpdateExamInput`                                                                                                                        | `Exam`                                                         | `EXAM_PUBLISHED`                                                                                               | —                                | 120/h      |
| `upsertExamSubject`                     | `ExamSubjectInput` {id?, examId, sectionSubjectId, examDate?, startsAt?, durationMinutes?, roomId?, fullMarks, passMarks, components?[]} | `ExamSubject`                                                  | `COMPONENT_SUM_MISMATCH`, `EXAM_LOCKED`                                                                        | —                                | 300/h      |
| `setExamStatus`                         | `SetExamStatusInput` {examId, status, reason?}                                                                                           | `Exam`                                                         | `INVALID_TRANSITION`, `REASON_REQUIRED`                                                                        | key required                     | 60/h       |
| `uploadExamPaper`                       | `ExamPaperInput` {examSubjectId, fileId}                                                                                                 | `ExamSubject`                                                  | `NOT_SUBJECT_TEACHER`                                                                                          | —                                | 60/h       |
| `saveMarks`                             | `SaveMarksInput` {examSubjectId, clientSessionId (uuid), entries: [{studentId, obtained?, componentMarks?, status, remarks?}]}           | `{saved: number, rejected: [{studentId, issue}]}`              | `SUBJECT_LOCKED`, `OUTSIDE_ENTRY_WINDOW`, `NOT_ASSIGNED`, `MARK_OUT_OF_RANGE` (per row)                        | **key required**                 | 600/h      |
| `submitExamSubject`                     | `SubmitExamSubjectInput` {examSubjectId}                                                                                                 | `ExamSubject`                                                  | `INCOMPLETE_ENTRY` (warning payload with the missing list)                                                     | key required                     | 120/h      |
| `lockExamSubject` / `unlockExamSubject` | `ExamSubjectIdInput` / `{examSubjectId, reason}`                                                                                         | `ExamSubject`                                                  | `ALREADY_LOCKED`, `REASON_REQUIRED`                                                                            | —                                | 120/h      |
| `createAggregateExam`                   | `CreateAggregateExamInput` {academicYearId, termId?, name, sectionIds[], components: [{examId, weightBp}]}                               | `Exam` with `examSubjects`                                     | `COMPONENT_IS_AGGREGATE`, `COMPONENT_WRONG_YEAR`, `NO_COMPONENTS`, `WEIGHTS_NOT_10000` (warning, saved anyway) | key required                     | 30/h       |
| `setExamComponents`                     | `SetExamComponentsInput` {aggregateExamId, components: [{examId, weightBp}]}                                                             | `ExamComponent[]`                                              | `EXAM_PUBLISHED`, `COMPONENT_IS_AGGREGATE`, `WEIGHTS_NOT_10000` (warning)                                      | —                                | 60/h       |
| `computeAggregateMarks`                 | `ComputeAggregateMarksInput` {aggregateExamId, sectionIds?}                                                                              | `{derived: number, skipped: number}`                           | `COMPONENT_NOT_LOCKED` (with the list), `NOT_AGGREGATE`, `EXAM_PUBLISHED`                                      | key required                     | 30/h       |
| `computeResults`                        | `ComputeResultsInput` {examId, sectionIds?}                                                                                              | `ComputeResultsSummary` {computed, incomplete, failed, ranked} | `MARKS_NOT_LOCKED`, `NO_GRADE_SCALE`, `AGGREGATE_NOT_DERIVED`                                                  | key required                     | 30/h       |
| `publishResults`                        | `PublishResultsInput` {examId, withholdStudentIds?: string[], note?}                                                                     | `{published: number, withheld: number}`                        | `NOT_COMPUTED`, `INCOMPLETE_PRESENT` (confirm)                                                                 | key required                     | 20/h       |
| `unpublishResults`                      | `UnpublishResultsInput` {…, reason}                                                                                                      | `{unpublished: number}`                                        | `REASON_REQUIRED`                                                                                              | key required                     | 10/h       |
| `upsertGradeScale`                      | `GradeScaleInput` {id?, name, passMark, failZeroesGpa, optionalSubjectRule, bands: [{letter, minPct, maxPct, gradePoint, isFail}]}       | `GradeScale`                                                   | `BAND_OVERLAP`, `BAND_GAP`, `SCALE_IN_USE` (must version instead)                                              | —                                | 60/h       |
| `seedBdGradeScale`                      | `{}`                                                                                                                                     | `GradeScale`                                                   | `ALREADY_SEEDED`                                                                                               | key on (workspace,'grade-scale') | 3/h        |
| `upsertReportComment`                   | `ReportCommentInput` {resultId, subjectId?, body, source}                                                                                | `ReportComment`                                                | `RESULT_PUBLISHED` (comments still editable until approved)                                                    | —                                | 300/h      |
| `approveReportComment`                  | `ApproveCommentInput` {commentId}                                                                                                        | `ReportComment`                                                | —                                                                                                              | —                                | 300/h      |
| `POST /api/pdf/mark-sheet`              | `MarkSheetPdfInput` {resultIds[] \| {sectionId, examId}, queuePrint?}                                                                    | `{fileId, printJobId?}`                                        | `NOT_PUBLISHED` (for parents)                                                                                  | key required                     | 30/h       |
| `POST /api/pdf/tabulation`              | `TabulationPdfInput` {examId, sectionId}                                                                                                 | `{fileId}`                                                     | `NOT_COMPUTED`                                                                                                 | key required                     | 30/h       |
| `GET /api/results/student`              | `StudentResultsQuery` {studentId, academicYearId?}                                                                                       | `ResultView[]` (published only for parents)                    | `FORBIDDEN`                                                                                                    | —                                | 600/h      |
| `generateSeatPlan`                      | `GenerateSeatPlanInput` {examId, examDate?, roomIds[], mixingRule}                                                                       | `ExamSeatPlan` with assignments                                | `INSUFFICIENT_CAPACITY`                                                                                        | key required                     | 30/h       |
| `lockSeatPlan`                          | `SeatPlanIdInput`                                                                                                                        | `ExamSeatPlan`                                                 | `ALREADY_LOCKED`                                                                                               | —                                | 60/h       |
| `generateInvigilationRoster`            | `GenerateRosterInput` {examId, examDate?}                                                                                                | `InvigilationDuty[]`                                           | `STAFF_CLASH` (list)                                                                                           | key required                     | 30/h       |
| `recordCustodyEvent`                    | `CustodyEventInput` {examSubjectId, roomId?, batchLabel, scriptCount, event, toStaffId?, note?}                                          | `AnswerScriptCustodyEvent`                                     | `INVALID_SEQUENCE`                                                                                             | key required                     | 300/h      |
| `POST /api/pdf/seat-plan`               | `SeatPlanPdfInput` {seatPlanId, queuePrint?}                                                                                             | `{fileId, printJobId?}`                                        | `PLAN_NOT_LOCKED`                                                                                              | key required                     | 30/h       |
| `POST /api/pdf/invigilation-roster`     | `RosterPdfInput` {examId, examDate?, queuePrint?}                                                                                        | `{fileId, printJobId?}`                                        | —                                                                                                              | key required                     | 30/h       |

SQL routines: `app.band_for(grade_scale_id, pct)`, `app.round_half_up(numeric, int)`, `app.compute_results(scope, …)` (writes `results` + `result_subject_lines` + ranks in one transaction).

## 8. Parts (build chunks)

**Part 1 — Grade scales and the grading domain** · `grade_scales` + `grade_scale_bands` with the coverage/overlap constraints, the BD default seed, `band_for` in SQL and TS with a parity test, `round_half_up` in both, settings screen with a live "72 % → A" preview · tests: full-range band mapping (every integer 0–100 and the .99 boundaries), rounding parity, seed idempotency · **Demo:** seed the BD scale and watch 72 % map to A in the preview, in SQL and in the domain unit test identically.

**Part 2 — Exams and papers** · `exams`, `exam_sections`, `exam_subjects`, `exam_subject_components` with the sum constraint, auto-creation of papers from `section_subjects`, exam list/detail, paper editor, explicit status transitions with reasons, calendar events for F-AC-11 · tests: pgTAP for the component-sum trigger and RLS (parents see only published exams); integration for every transition including refused reversals · **Demo:** schedule "Half-Yearly 2026" for Class 6 and get 14 papers pre-created with dates set in one sheet.

**Part 3 — Marks entry (phone + desktop)** · `marks` table, bulk upsert in one statement, `MarksEntryList` with a persistent keypad and Enter-to-advance, absent/exempt chips, desktop grid with paste, entry window enforcement in RLS and domain, autosave draft · tests: e2e timing (40 students in under 2 minutes at 360×800), per-row validation with partial save, pgTAP proving a non-assigned teacher cannot read or write the paper · **Demo:** a teacher enters 40 marks on a phone without the keyboard ever closing, and a colleague teaching another subject cannot read them.

**Part 4 — Offline queue, submit and lock** · IndexedDB queue with idempotency keyed on (exam_subject, client session), conflict sheet, `submitExamSubject` with an incomplete warning, lock/unlock with reasons, marks-progress screen, `marks.due` and `marks.submitted` notifications · tests: offline journey with reconnect producing exactly one set of marks; unlock audit · **Demo:** enter marks with the network off, reconnect, and see one clean submission. _(2026-09-26, D-71: the offline queue half of this Part is built as F-ID-11 Part 3 — marks sync per cell, the later edit wins and the overwritten value stays in the audit, no conflict sheet; this Part keeps submit, lock and progress.)_

**Part 5 — Result computation and rank in SQL** · `results`, `result_subject_lines`, `app.compute_results` for `exam` scope with GPA, F→0, pass/fail, incomplete handling and `rank() over (partition by section)`, results preview screen · tests: a golden fixture of 40 students with ties, an F, an exempt subject, an absent subject and an incomplete student — asserted row by row; a property test that GPA is never > 5.00 · **Demo:** compute Class 6 – A's half-yearly result and see ranks 1, 2, 2, 4 with one GPA-0 failure and one unranked incomplete.

**Part 6 — Optional subject and aggregate (term / annual) exams** · `exams.kind`, `exam_components` with `weight_bp` and its guard triggers, the aggregate builder screen, `computeAggregateMarks` deriving `marks` per §5.7, `bd_fourth_subject` rule with `gpa_without_optional`, derived `result_scope` · tests: weighting fixture (3000/3000/4000) verified against hand-computed expectations; renormalisation when the sum is not 10000; exempt-in-one-component excluded and absent-in-one-component costing full weight; no-nesting guard; optional-subject bonus capped at 5.00 · **Demo:** build "Annual Result 2026" from 1st Term 30 % / Final 70 %, compute it, and print a report card that matches a hand-calculated sheet — through the same code path as a regular exam.

**Part 7 — Publishing and the parent surface** · `publishResults` with `frozen_payload`, per-student withholding, unpublish with notification, `result.published` fan-out to guardians, parent-visible RLS on `results`/`result_subject_lines`, the F-AC-10 results tab wiring · tests: pgTAP proving an unpublished result is invisible to a parent and a published one is visible only to that child's guardians; freeze test (rename a subject after publishing and assert the mark sheet is unchanged) · **Demo:** publish Class 6's result and watch a parent's portal update; rename a subject and confirm the issued mark sheet still reads the old name.

**Part 8 — Mark sheet, tabulation and comments** · React-PDF mark sheet with the school header from `school_profiles`, Bengali font, attendance summary from F-AC-03 and the approved comment; bulk section PDF; landscape tabulation sheet; `report_comments` with AI suggestion through the credit flow and mandatory teacher approval; print-queue hand-off · tests: PDF snapshot tests for pass, fail-with-GPA-0 and incomplete cases; a test asserting an unapproved comment never appears in the parent payload · **Demo:** print 40 mark sheets in one PDF whose header is the school's own name and whose GPA column matches the portal exactly.

**Part 9 — Seat plan, invigilation roster and answer-script custody** (R1) · `exam_seat_plans` + `exam_seat_assignments` with the three mixing rules, `invigilation_duties` generated from rooms + timetable + staff with clash detection, `answer_script_custody_events` with the custody-gate check on lock, printable seat-plan and roster PDFs, custody timeline screen with an exceptions list · tests: deterministic seat generation fixture (same seed → same seats), capacity-shortfall refusal, staff double-booking refusal, custody-chain enforcement blocking `lockExamSubject` until `filed`/`handed_to_office` · **Demo:** generate a seat plan mixing three sections across two rooms by roll interleave, generate the matching invigilation roster with no staff double-booked, print both, and try to lock a paper whose scripts were never marked `filed` — and watch it refuse with `CUSTODY_INCOMPLETE`.

## 9. Acceptance criteria

1. **Given** the seeded Bangladesh scale, **when** a student scores 72 %, **then** the letter is A and the grade point 4.00 on the teacher's screen, the parent portal, the mark sheet PDF and the SQL function — all four from one band table (the prototype disagreed across screens).
2. **Given** a student with grade points 5, 4, 3.5, 4, 5 in five countable subjects and no fail, **when** results compute, **then** `gpa = round_half_up(21.5/5, 2) = 4.30`.
3. **Given** the same student with an F (0.00) in one subject and `fail_zeroes_gpa = true`, **when** results compute, **then** `gpa = 0.00`, `result_status = 'fail'`, `failed_subjects = 1`, and the mark sheet shows every subject's real letter alongside the GPA of 0.00.
4. **Given** `optional_subject_rule = 'bd_fourth_subject'` and `fourth_subject_bonus_threshold_gp = 2.00`, a student with **6 compulsory subjects each at grade point 4.00** and a 4th subject at 5.00, **when** results compute, **then** `gpa_without_optional = 4.00` and `gpa = (24.00 + max(0, 5.00 − 2.00)) / 6 = 27.00 / 6 = 4.50` — the denominator is the count of **compulsory** subjects only.
   4b. **Given** the same student whose 4th subject is at grade point 1.00 (a fail), **when** results compute, **then** `bonus = max(0, 1.00 − 2.00) = 0`, `gpa = 4.00`, `failed_subjects = 0`, `result_status = 'pass'`, and the mark sheet still prints the 4th subject's "D" line marked "(4th subject)" — **a failing 4th subject neither fails the student nor lowers the GPA**.
   4c. **Given** 5 compulsory subjects at 5.00 and a 4th subject at 5.00, **when** results compute, **then** `gpa = min(5.00, (25.00 + 3.00)/5 = 5.60) = 5.00` — the cap holds.
   4d. **Given** a compulsory subject with an F and `fail_zeroes_gpa = true`, **when** results compute, **then** `gpa = 0.00` regardless of the 4th subject's bonus.
   4e. **Given** two subject lines both resolved as `optional_fourth` for one student, **when** results compute, **then** it fails with `MULTIPLE_FOURTH_SUBJECTS` rather than silently picking one.
   4f. **Given** a subject that is compulsory in Class 9 – A and the 4th subject in Class 9 – B, **when** each section's results compute, **then** each uses its own `section_subjects.is_optional_fourth` and the value is snapshotted onto `result_subject_lines.subject_kind`; renaming or re-categorising the subject afterwards does not change either issued result.
5. **Given** a subject marked `exempt`, **when** results compute, **then** it is excluded from GPA, totals and percentage, and prints as "—" — it does not score zero.
6. **Given** a student absent from one paper, **when** results compute, **then** that subject scores 0, counts as failed, and (with default settings) the GPA is 0.00.
7. **Given** four students with GPAs 5.00, 4.50, 4.50, 4.00 in a section, **when** ranks compute, **then** their section ranks are 1, 2, 2, 4 and the ordering is produced by SQL `rank()`, not by client sorting.
8. **Given** a student missing marks in one countable subject, **when** results compute, **then** `result_status = 'incomplete'`, `gpa is null`, `section_rank is null`, and the preview lists them so the office can chase the paper.
9. **Given** an aggregate exam with components 1st Term `weight_bp = 3000` and Final `weight_bp = 7000`, and a student whose subject percentage is 60 in the first and 80 in the final, **when** the aggregate's marks are derived, **then** that subject's percentage is `(3000×60 + 7000×80)/10000 = 74.00`, the derived mark is `round_half_up(74.00 × full_marks / 100, 2)`, and its letter comes from the same band table as any other exam.
10. **Given** an aggregate with no `exam_components` rows, **when** marks are derived, **then** every regular exam in scope is used with equal weight and the preview shows "weights not configured, using equal weights"; **given** weights of 30 and 80 (sum ≠ 100 %), **then** a non-blocking warning shows and the result renormalises over `Σ weight_bp` (identical to 3000/8000).
    10b. **Given** an aggregate exam, **when** `computeResults` runs on it, **then** GPA, pass/fail, rank, publishing, the mark sheet and the parent portal all use the identical code path as a regular exam — asserted by an integration test that compares an aggregate's `results` row against a regular exam's row built from the same derived marks.
    10c. **Given** a component exam whose marks are not locked, **when** the aggregate is computed, **then** it fails with `COMPONENT_NOT_LOCKED` naming that exam; **given** a component of `kind = 'aggregate'`, **then** it is refused (no nesting).
11. **Given** a teacher on a 360×800 phone with 40 students, **when** they enter all 40 marks, **then** the numeric keypad never closes, Enter advances to the next student, and the whole pass completes in under two minutes (measured in the e2e journey) with one bulk save.
12. **Given** a mark above `full_marks`, **when** Save runs, **then** that row is rejected with an inline error and every valid row still saves.
13. **Given** a locked paper, **when** a teacher attempts `saveMarks`, **then** both the permission check and RLS refuse it and the UI offers "Request unlock"; **when** an admin unlocks with a reason, **then** the reason appears in `audit_events`.
14. **Given** a teacher of Mathematics in Class 6 – A, **when** they request the Class 6 – A Science marks, **then** RLS returns nothing — proved by a pgTAP negative test.
15. **Given** an unpublished result, **when** a parent queries it, **then** nothing is returned; **given** it is published, **then** exactly their own child's result is returned and no classmate's.
16. **Given** a published result, **when** an admin renames the subject "Science" to "General Science" and reprints the mark sheet, **then** the issued sheet still reads "Science" from `frozen_payload`.
17. **Given** an AI-suggested comment that the class teacher has not approved, **when** the parent portal loads, **then** the comment is absent; **when** it is approved, **then** it appears.
18. **Given** a printed mark sheet, **when** it renders, **then** the header is the school's name from `school_profiles` and Bengali subject names render correctly with the embedded font.
19. **Given** an exam status of `published`, **when** anyone presses any control, **then** there is no single button that can send it back to `draft` — reversals are explicit, labelled and require a reason.
20. **Given** a student below 75 % term attendance, **when** the exam roster renders, **then** an eligibility warning shows and the student is still allowed to sit and to receive a result.

## 10. Tests

- **Unit (`packages/domain`, ≥ 80 %)**: `subjectPercentage` (incl. absent/exempt/withheld), `bandFor` over every integer 0–100 and each boundary at .99, `gpa` across the whole matrix (fail present/absent, exempt lines, optional rule on/off, decimals), `fourthSubjectGpa(compulsoryGradePoints[], fourthGradePoint?, thresholdGp)` against a fixed vector table — **`([4,4,4,4,4,4], 5.00, 2.00) → 4.50`**, `([4,4,4,4,4,4], 1.00, 2.00) → 4.00`, `([4,4,4,4,4,4], 2.00, 2.00) → 4.00`, `([5,5,5,5,5], 5.00, 2.00) → 5.00` (capped from 5.60), `([5,4,0,4,5], 5.00, 2.00) → 0.00` (compulsory F with `fail_zeroes_gpa`), `([4,4,4,4,4,4], undefined, 2.00) → 4.00` — plus `aggregateSubjectPercentage(components, weightsBp)` (missing component, exempt component, absent component, no weights configured, sum ≠ 10000 renormalisation), `passFail`, `resultStatus`, `roundHalfUp` against a table of adversarial values (2.675, 4.455, 0.005), `rankAssignment` ties.
- **DB (pgTAP)**: isolation and escalation for `exams`, `exam_subjects`, `marks`, `results`, `result_subject_lines`, `report_comments`; the teacher-attachment read/write policy on `marks` (positive for the assigned teacher, negative for a colleague); the entry-window predicate; parents seeing only published results for their own children; band overlap/gap constraints; component-sum trigger; `workspace_id` immutability.
- **Parity tests**: `band_for` and `round_half_up` SQL vs TS over a generated matrix; `app.compute_results` vs a pure TS reference implementation over the golden 40-student fixture — CI fails on any divergence. This is the single most important test in the area, because it is the one the prototype's four grade-letter implementations would have failed.
- **Integration**: every action's happy path and named errors; `saveMarks` partial-save semantics and replay; `computeResults` idempotency (recomputing produces identical rows); `publishResults` freeze; `unpublishResults` notification.
- **E2E (360×800 and 1280×800, axe)**: `enter-40-marks-on-phone` (timed, keypad assertion), `offline-marks-sync`, `lock-compute-publish`, `parent-sees-published-result-only`, `print-mark-sheet`. Axe clean on marks entry, results preview and grading settings.
- **Performance budgets**: `saveMarks` for 60 students is one statement, p95 < 400 ms; `app.compute_results` for a 500-student grade < 3 s; results preview load < 500 ms; a 40-page mark-sheet PDF < 10 s.

## 11. Open questions

**Part 3 status (demo cut, D-304):** `marks` (`entered` with a number, or `absent`/`exempt`), `exam_subjects.teacher_id` (the paper's teacher, named by an owner/admin on the exam page, standing in for `section_subjects` until F-AC-01 ships it), `public.save_marks`, and `/app/marks/[examSubjectId]` — 72 px rows, a large numeric input, Enter to the next student, Absent/Exempt chips, a sticky "24/40 · Save", per-row inline errors; ↑/↓, Esc, A, E and Ctrl+S on desktop. Who: an owner/admin, the paper's teacher or the class teacher (`app.can_enter_marks`); staff read; another subject's teacher reads nothing (AC14). Entry is open while the exam is in `marks_entry` and the paper is not `locked`. The save is idempotent and checks each row: out of range → `MARK_OUT_OF_RANGE`, changed by someone else since it was loaded → `CONFLICT`; the other rows save (AC12). A changed mark is audited before/after. **Part 4's completeness gate is in:** Publish is refused (`MARKS_INCOMPLETE`) until every enrolled student in every paper has a mark or is absent/exempt. The owner confirmed on 2026-09-26 that D-302 stands: percentages to 2 decimals, no rounding before banding (79.5 → A, 32.5 → F). Deviations: no entry date window, no autosave draft or offline queue, no components, no paste-a-column or histogram, no `withheld` or remarks, no teacher "my papers" list; the screen uses `ui/input`, not `MarkCell` (which clamps, contrary to AC12) — see D-304.

**Offline marks sync (owner decision, 2026-09-26; for when the offline queue lands in Part 4 — not built yet):** sync is **per cell**: the later edit wins, and the overwritten value is kept in the audit trail. This replaces §4.2's "same queue and idempotency contract as F-AC-03" for marks: no whole-paper conflict sheet. D-71 (item 3) carries it into the platform-wide outbox; "later" is `client_edited_at`.

**Part 2 status (demo cut, D-303):** `exams`, `exam_sections`, `exam_subjects`, `public.create_exam`, the §5.12 status chain in the database and the domain (`checkExamTransition`), `/app/exams` (list and New exam sheet) and `/app/exams/[id]` (labelled status actions, a reason for the two reversals, per-paper date, full marks and pass marks). The grading policy D-302 deferred is snapshotted on the exam at creation and is immutable. Deviations: no `term_id` (no `terms` table yet; `exam_type` names the part of the year); papers are exam × section × the subjects the admin picks (no `section_subjects` yet); `exam_subject_components`, `kind`/aggregate exams (Part 6), calendar events (F-AC-11), the question-paper upload, idempotency keys and rate limits on `createExam` are not built. Scale versioning is covered by the snapshot: an edited scale never changes an existing exam. "The pass boundary equals the pass mark" is carried as `pass_mark_percent` in the snapshot and the per-paper `pass_marks` default, which is not rounded (16.50 of 50). Enforcing it as a band rule waits for results (Part 5). After review (D-303):

- Results must read `grading_snapshot.bands`, never the live scale.
- Papers lock from `marks_entry` on, and nothing is deleted after `draft`.
- A paper's status moves one step at a time.
- **Publish has no marks-completeness gate yet — Part 4 must add one.** Done in Part 3 (D-304, `MARKS_INCOMPLETE`).

**Part 1 status (shipped, D-302):** `grade_scales` + `grade_bands` (DATA-MODEL's names — `code`, `min_percent`, `max_percent`, `sort_order` — plus `is_fail`), the deferred no-gap/no-overlap coverage trigger, `app.band_for` / `app.round_half_up` and `packages/domain/src/grading` (`bandFor`, `roundHalfUp`, `checkCoverage`) pinned to one parity table in `supabase/tests/52_grade_scales.sql`, `public.seed_bd_grade_scale` (idempotent) and `public.save_grade_scale`, and `/app/settings/grade-scale` with the one-tap Bangladesh default and the live "72 % → A (4.00)" preview. After review (D-302): no rounding before banding (79.5 → A, 32.5 → F); grade points may not decrease band by band; bands change only through the SECURITY DEFINER RPCs; code and is_default are immutable. **Deferred to Part 2:** scale versioning (exams snapshot the scale) and "the pass boundary equals the pass mark". Deviations: §3's `pass_mark`, `fail_zeroes_gpa`, `optional_subject_rule`, `optional_bonus_threshold`, `gpa_decimals`, `effective_from`, `is_active` and band `colour` are not on the scale yet — those rules already live in `school_profiles.academic_settings` and `academic_years`, and move onto the scale only when exams (Part 2) need to snapshot them. Part 1 edits the existing scale only; creating extra scales and `SCALE_IN_USE` versioning wait for exams to reference a scale. The permission key is F-OP-07's `settings.grade_scale.write` (owner/admin).

1. **Component pass rule.** `use_component_pass` is modelled but defaults off. Assumed: schools that require passing the practical separately turn it on; confirm whether the default should be on for Class 9–10 science.
2. **Grace marks.** Not modelled in v1. Assumed: a teacher edits the mark and writes a remark; if boards' grace-mark rules are needed, they become a `marks.grace` column plus an audited action.
3. **Promotion rule from results.** F-AC-02 §4.6 defaults "fail → repeat". Assumed: `result_status = 'fail'` on the annual scope is the trigger; schools with "fail in ≤ 2 subjects → promote on condition" need a `promotion_rule` setting, flagged for the owner.
4. **Re-exams / retakes.** Assumed: a retake is a new exam of type `model_test`/`other` with its own weight, not a mutation of the original marks. Confirm whether the annual result should prefer the retake mark.
5. **Board-style subject grouping** (compulsory / group / optional with different GPA counts for SSC candidates). Assumed: `subjects.counts_in_gpa` plus `is_optional` covers v1; full board tabulation is a later feature.
6. **Who may see rank?** v1 shows section rank to parents. Assumed acceptable in BD schools, but it is a single flag (`grading.show_rank_to_parents`) if the owner wants it off.
7. **Exam-hall seating and invigilation.** Resolved by §3/§4.10/§8 Part 9: seat plans (আসন বিন্যাস) and the invigilation duty roster (কক্ষ পরিদর্শক তালিকা) are now modelled and generated from rooms + timetable + staff, both printable, R1. `exam_subjects.invigilator_id`/`room_id` remain as the single-invigilator convenience for a simple paper; `invigilation_duties` is the source of truth once a roster is generated.
