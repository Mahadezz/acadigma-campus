# F-AC-01 — Academic structure (years, terms, grades, sections, subjects)

|                  |                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                             |
| Status           | planned                                                                                                               |
| Owner branch     | `feat/academics-structure`                                                                                            |
| Depends on       | F-AU-01 (auth + workspaces), F-AU-02 (memberships/roles), F-AU-04 (school profile & settings)                         |
| Plan             | `docs/plan/ROADMAP.md` chunk 3                                                                                        |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (Class), §3 features 1–4, §6 items 11, 12, 36, 37, §7 Q3, Q5 |

## 1. Purpose

Every other academic feature hangs off this one. An admin sets up the school's skeleton once per academic year: the **academic year** and its **terms**, the **grade levels** the school teaches (Play/Nursery/KG → Class 1…12), the **sections** inside each grade (Class 6 – A, the homeroom, with a class teacher and a room), the **subjects** catalogue, and the **section_subjects** join that says _who teaches what, where, to whom_ — one primary teacher plus optional assistants. "Done" from the admin's chair: after ten minutes in a bulk setup wizard on a phone, the school has Class 1–10 × A/B with class teachers, a subject list matching its board, and every section-subject assigned, so attendance, timetable, marks, assignments and the parent portal all have something real to point at.

**Base44 intent vs reality.** The prototype had one entity, `Class`, which the schema modelled as a _class-subject pair_ (`Class.subject` required) while the only creation UI treated it as a homeroom and never sent `subject` — so every created row violated its own schema (`Classes.jsx:112-120`). `Class.teacher_name` was free text, not a user reference; `Class.total_students` and `Class.level_group` were never written; the UI rendered `cls.teacher_id_code`, a field that does not exist. There was no academic year, no term entity (terms were a hardcoded 5-value enum on `Mark`), no subject catalogue, no room entity and no delete. PRODUCT-DECISIONS 2.3 resolves this: grade_levels → sections → section_subjects, students enrol into exactly one section per year.

## 2. Roles and permissions

`packages/domain/permissions.ts` keys. Roles: owner (O), admin (A), teacher (T), staff (S), parent (P), platform (PL).

| Action                                                    | Permission key                           | O   | A   | T                                | S   | P                               | PL   |
| --------------------------------------------------------- | ---------------------------------------- | --- | --- | -------------------------------- | --- | ------------------------------- | ---- |
| View structure (years, grades, sections, subjects)        | `academics.structure.read`               | yes | yes | yes                              | yes | only via the parent portal view | read |
| Create/edit academic year & terms                         | `academics.year.write`                   | yes | yes | no                               | no  | no                              | no   |
| Activate / close an academic year                         | `academics.year.activate`                | yes | yes | no                               | no  | no                              | no   |
| Create/edit grade levels                                  | `academics.grade.write`                  | yes | yes | no                               | no  | no                              | no   |
| Create/edit/archive sections                              | `academics.section.write`                | yes | yes | no                               | no  | no                              | no   |
| Assign class teacher                                      | `academics.section.assign_class_teacher` | yes | yes | no                               | no  | no                              | no   |
| Create/edit subjects                                      | `academics.subject.write`                | yes | yes | no                               | no  | no                              | no   |
| Assign section-subject teachers                           | `academics.section_subject.write`        | yes | yes | no                               | no  | no                              | no   |
| Edit own section_subject metadata (periods target, notes) | `academics.section_subject.write_own`    | yes | yes | primary teacher of that row only | no  | no                              | no   |
| Create/edit rooms                                         | `academics.room.write`                   | yes | yes | no                               | no  | no                              | no   |
| Run the bulk setup wizard                                 | `academics.setup.run`                    | yes | yes | no                               | no  | no                              | no   |
| Delete a section/subject (only when unused)               | `academics.structure.delete`             | yes | yes | no                               | no  | no                              | no   |

Teachers read everything structural (they need the subject list and section names everywhere) but write nothing except their own section_subject metadata. Staff are read-only. Platform admin: read for support, no writes.

## 3. Data

> Columns below are **proposed; `docs/architecture/DATA-MODEL.md` wins** if it differs. Tenant key on every table is `workspace_id uuid not null references workspaces`. All tables carry `id`, `created_at`, `updated_at`, `created_by` per ARCHITECTURE §4.

**`academic_years`** — `name text` ("2026"), `starts_on date`, `ends_on date`, `status academic_year_status` (`planned|active|closed`), `is_current bool`, `board text null`, **`fourth_subject_bonus_threshold_gp numeric(3,2) default 2.00`** (the BD 4th-subject bonus threshold, per year because boards have changed it; consumed by F-AC-06 §5.4, which falls back to `grade_scales.optional_bonus_threshold` when null), `promoted_at timestamptz null`.
Indexes: `unique (workspace_id, name)`; partial `unique (workspace_id) where is_current`. Check `ends_on > starts_on`.

**`terms`** — `academic_year_id`, `name text` ("1st Term", "Mid Term", "Final"), `sequence int`, `starts_on date`, `ends_on date`.
Indexes: `unique (academic_year_id, sequence)`, `unique (academic_year_id, name)`. Terms must not overlap: exclusion constraint on `(academic_year_id with =, daterange(starts_on, ends_on, '[]') with &&)`.

**`grade_levels`** — `code text` (`PLAY`,`NUR`,`KG`,`C1`…`C12`), `name text` ("Class 6"), `name_bn text null` ("ষষ্ঠ শ্রেণি"), `ordinal int` (Play = −3 … Class 12 = 12), `stage grade_stage` (`pre_primary|primary|junior|secondary|higher_secondary`), `is_active bool`.
Indexes: `unique (workspace_id, code)`, `index (workspace_id, ordinal)`.

**`sections`** — `academic_year_id`, `grade_level_id`, `name text` ("A"), `class_teacher_id uuid null references workspace_members`, `room_id uuid null references rooms`, `capacity int null`, `shift text null` (`morning|day|evening`), `stream text null` (`science|commerce|arts`), `student_count int default 0` (trigger-maintained cache), `is_active bool`, `archived_at timestamptz null`.
Indexes: `unique (academic_year_id, grade_level_id, name)`, `index (workspace_id, academic_year_id)`, partial `unique (academic_year_id, class_teacher_id) where class_teacher_id is not null` (see rule 5.10).

**`subjects`** — `code text` (`BAN`,`ENG`,`MATH`…), `name text`, `name_bn text null`, `category subject_category` (`core|optional|religion|co_curricular`), **`subject_kind subject_kind` (`compulsory|optional_fourth`, default `compulsory`)** — the catalogue default for the Bangladesh 4th-subject GPA rule (F-AC-06 §5.4), overridden per section by `section_subjects.is_optional_fourth`, `counts_in_gpa bool default true`, `credit numeric(4,2) default 1.00`, `default_full_marks int default 100`, `colour text null`, `is_active bool`.
Indexes: `unique (workspace_id, code)`.

**`grade_level_subjects`** — the per-grade template that section creation copies from: `academic_year_id`, `grade_level_id`, `subject_id`, `is_optional bool`, `full_marks int`, `pass_marks int`.
Index: `unique (academic_year_id, grade_level_id, subject_id)`.

**`section_subjects`** — `section_id`, `subject_id`, `academic_year_id` (denormalised for fast filters), `primary_teacher_id uuid null references workspace_members`, `room_id uuid null`, `periods_per_week int null` (target; read by F-AC-05 and by pacing in the teaching area), `full_marks int`, `pass_marks int`, **`is_optional_fourth boolean null`** — per-section override of `subjects.subject_kind` for the BD 4th-subject rule; the effective value is `coalesce(section_subjects.is_optional_fourth, subjects.subject_kind = 'optional_fourth')`, because Higher Mathematics or Agriculture is compulsory in one section and the 4th subject in another, `is_active bool`.
Indexes: `unique (section_id, subject_id)`, `index (workspace_id, primary_teacher_id)`, `index (workspace_id, academic_year_id, subject_id)`, partial `unique (section_id) where is_optional_fourth` — a section offers at most one 4th subject.

**`section_subject_teachers`** — assistants, per PRODUCT-DECISIONS 3.8: `section_subject_id`, `member_id`, `role section_subject_teacher_role` (`assistant|substitute_default`), `sort int`.
Index: `unique (section_subject_id, member_id)`.

> **Ownership.** `academic_years` and `terms` are **owned by this feature** — their migration, RLS, constraints and server actions live here. F-OP-07 specifies only the _settings screens_ that edit them and calls the actions in §7. The other academics-owned shared tables are `grade_scales` / `grade_scale_bands` (F-AC-06) and `holidays` (F-AC-11).

**`rooms`** — `name text` ("Room 204"), `code text null`, `type room_type` (`classroom|lab|library|hall|other`), `capacity int null`, `building text null`, `floor int null`, `is_active bool`.
Index: `unique (workspace_id, name)`.

**Enums** (Postgres enums mirrored in `packages/contracts` and checked by the enum-parity test): `academic_year_status`, `grade_stage`, `subject_category`, `room_type`, `section_subject_teacher_role`.

**RLS in words.** Every table above: SELECT allowed to any **active** member of the workspace whose role is owner, admin, teacher or staff. Parents have **no** direct policy here; the parent portal reads section and subject names through a security-definer view scoped by `app.is_guardian_of(student_id)` (F-AC-10). INSERT/UPDATE/DELETE restricted to owner and admin, with one extra UPDATE policy allowing the row's `primary_teacher_id` to change only `periods_per_week` and notes on `section_subjects`. `workspace_id` is immutable on update. DELETE is further blocked by `on delete restrict` foreign keys from `enrollments`, `attendance_sessions`, `marks`, `assignments` and `timetable_slots`, so a used section cannot be deleted at all — the UI offers **archive**. Platform admin gets a read-only bypass policy.

**Private files.** None in this feature.

**Seeds.** (Demo cut: the list lives in `packages/domain/src/academic/structure.ts` and uses two papers for Bangla and English, and one religion subject per faith — D-102.) `supabase/seed/bd-defaults.sql` supplies, as _copies into the workspace_ (never cross-tenant references): 16 grade levels (Play, Nursery, KG, Class 1–12 with ordinals −3…12 and Bengali names) and an NCTB starter subject catalogue (Bangla, English, Mathematics, Science, Bangladesh & Global Studies, ICT, Religion & Moral Education, Physical Education, Agriculture, Home Science, Higher Mathematics, Physics, Chemistry, Biology, Accounting, Business Entrepreneurship, Economics), with board variants NCTB / Madrasah / Cambridge / Edexcel.

## 4. Workflows

**4.1 First-time setup (bulk wizard).**
_Trigger:_ owner/admin opens `/app/settings/academics/setup`, or taps "Set up academic year" on the dashboard empty state.
_Steps_ (one full-screen step per phone screen, sticky bottom Continue button inside the thumb zone):

1. **Year** — name (defaults to the calendar year), start/end dates (default 1 Jan – 31 Dec, Asia/Dhaka), board.
2. **Terms** — preset picker (3-term: 1st Term / 2nd Term / Final · 2-term: Half-Yearly / Annual · custom) then editable date ranges.
3. **Grades** — checkbox list of the 16 BD grade levels, Class 1–10 pre-ticked, plus "Add custom grade".
4. **Sections** — per selected grade a stepper "how many sections?" (1–8); names auto-fill A, B, C…; optional capacity.
5. **Subjects** — the seeded catalogue filtered by board, pre-ticked; a per-grade override sheet ("Class 9–10 also take Higher Mathematics").
6. **Teachers** _(skippable)_ — pick a class teacher per section; bulk-assign primary teachers by subject ("Mr. Rahman teaches Mathematics in 6A, 6B, 7A").
7. **Review** — counts ("11 grades · 22 sections · 14 subjects · 308 section-subjects · 14 unassigned") then **Create**.
   _Outcome:_ one transactional server action writes everything and marks the year `active` + `is_current`.
   _Notifications:_ `academics.year.created` (in-app, owners + admins); `academics.assigned_subject` to each teacher who received assignments.
   _Audit:_ `academic_year.created`, `term.created`×n, `grade_level.created`×n, `section.created`×n, `subject.created`×n, `section_subject.created`×n — all sharing one `correlation_id`.
   _Failures:_ any validation failure aborts the whole transaction and returns a per-step error map; a duplicate year name is caught before the transaction opens; partial writes are impossible; re-submitting with the same idempotency key returns the first result.

**4.2 Add a section mid-year.** Admin → `/app/classes` → grade card → "Add section" sheet (name, capacity, class teacher, room) → saved → subjects auto-copied from `grade_level_subjects` into `section_subjects` with no teacher → the section page shows a "3 subjects need a teacher" banner. Audit `section.created`. Failure: duplicate name in that grade → `SECTION_NAME_TAKEN` on the name field.

**4.3 Assign or change a teacher.** Admin opens a section → Subjects tab → taps a subject row → sheet with **Primary teacher** (single select over active members with role teacher/admin/owner) and **Assistants** (multi-select, max 3). Save. Notifications: `academics.assigned_subject` to the new teacher, `academics.unassigned_subject` to the previous one. Audit `section_subject.teacher_changed` with before/after. Failure: assigning a removed member → 422 `MEMBER_NOT_ACTIVE`. Changing a teacher never rewrites history — past marks and attendance keep their own `recorded_by`.

**4.4 Archive a section / close a year.** Archiving requires zero active enrollments; otherwise the sheet refuses and links to the transfer flow in F-AC-02. Closing a year sets `status='closed'`, which makes every academic write in that year fail server-side with `YEAR_CLOSED`, and unlocks the promotion wizard (F-AC-02 §4.6). Audit `academic_year.closed`. Notification `academics.year.closed` to owners/admins.

**4.5 Member removal (orphaning hook).** When `workspace_members.status` becomes `removed`, a trigger nulls that member's `primary_teacher_id` on `section_subjects`, deletes their `section_subject_teachers` rows, and nulls `sections.class_teacher_id`; one aggregated notification `academics.subject_unassigned` goes to admins listing the affected rows. This is the academic half of PRODUCT-DECISIONS 3.7.

**4.6 Phone flow.** `/app/classes` is a **grade list** (56 px card rows) → tap a grade → **section list** → tap a section → **section detail** with three horizontally scrollable tabs (Students · Subjects · Timetable). Every create/edit is a bottom **Sheet** with one sticky primary button; no centred dialogs on phone. The wizard is a full-screen route with a progress bar and a back-swipe guard ("Discard setup?"), and its draft is kept both in `localStorage` and as a server-side draft row so a dropped connection loses nothing.

## 5. Business rules and calculations

1. **One current year.** Exactly one `academic_years.is_current = true` per workspace, enforced by the partial unique index plus a trigger that clears the previous row in the same statement. Setting `is_current` requires `status = 'active'`.
2. **Term containment.** Each term's `[starts_on, ends_on]` must lie inside its academic year and must not overlap a sibling (exclusion constraint). Gaps between terms are allowed (vacations).
3. **Current term** = the term whose inclusive range contains _today in `school_profiles.timezone`_; if none (a vacation gap), the most recently ended term of the current year. Computed by `app.current_term(workspace_id)` in SQL, never by the client, never from UTC (Base44 bug: inventory §8 / PRODUCT-DECISIONS 6.10).
4. **Section display name** = `grade_levels.name || ' – ' || sections.name` (en dash), e.g. "Class 6 – A". Produced by one helper in `packages/domain`; no screen builds its own label.
5. **Grade ordering** is always by `grade_levels.ordinal`, never alphabetical: Play = −3, Nursery = −2, KG = −1, Class 1 = 1 … Class 12 = 12. Stage is derived: `ordinal < 1 → pre_primary`, `1–5 → primary`, `6–8 → junior`, `9–10 → secondary`, `11–12 → higher_secondary`.
6. **Subject sets.** A section's subjects are seeded from `grade_level_subjects` at creation and are independently editable afterwards. Editing the grade template does **not** retro-edit existing sections; it offers an explicit "apply to 4 sections?" action.
7. **Capacity is advisory.** Enrolling past `capacity` shows a warning and never blocks (same posture as the 75 % attendance rule in PRODUCT-DECISIONS 2.2).
8. **`sections.student_count`** is maintained by an `after insert/update/delete` trigger on `enrollments` counting `status = 'active'` rows. It is a cache for list screens; every report recomputes from `enrollments`.
9. **Teacher eligibility.** `primary_teacher_id`, assistants and `class_teacher_id` must reference `workspace_members` with `status = 'active'` and role in {owner, admin, teacher}. Enforced in the domain layer _and_ by a trigger.
10. **Class teacher uniqueness.** A member may be class teacher of at most one section per academic year (partial unique index). The setting `school_profiles.allow_multi_class_teacher` (default `false`) relaxes it to a warn-and-confirm for very small schools.
11. **Working days** are read from `school_profiles.working_days` (default Sat–Thu, Asia/Dhaka). This feature stores no week shape of its own and no screen hardcodes one.
12. **Delete vs archive.** Hard delete is only possible when no dependent row exists (`on delete restrict`). Otherwise archive: archived rows vanish from pickers but stay readable in history and in printed documents.
13. **Counts shown in the wizard review** are computed as `sections = Σ_grades sectionCount(grade)` and `sectionSubjects = Σ_sections |subjects(grade(section))|`; `unassigned = |{section_subjects with primary_teacher_id is null}|`.

## 6. UI

| Screen                | Route                              | 360×800                                                                   | ≥1024                                                    | Primary action          | Empty                                       | Loading           | Error                               |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------- | ------------------------------------------- | ----------------- | ----------------------------------- |
| Classes (grades)      | `/app/classes`                     | Card list of grades with section + student counts; FAB "Add" bottom-right | Two-column grid; right panel previews the selected grade | Add grade / Add section | "No academic year yet → Set up your school" | 6 skeleton cards  | Inline retry banner, last data kept |
| Sections of a grade   | `/app/classes/[gradeId]`           | Rows: "Class 6 – A · 38 students · Ms. Nadia"                             | Table: class teacher, room, capacity, subject count      | Add section             | "No sections in Class 6 → Add section"      | Skeleton rows     | Retry                               |
| Section detail        | `/app/classes/[sectionId]`         | Sticky header + 3 scrollable tabs                                         | Header + left tab rail, right content pane               | Contextual per tab      | Per tab                                     | Per tab           | Per tab                             |
| Subjects catalogue    | `/app/settings/academics/subjects` | Grouped list by category; swipe row → Archive                             | Table with inline edit                                   | Add subject             | "Use the NCTB starter list" one-tap seed    | Skeleton          | Retry                               |
| Academic year & terms | `/app/settings/academics/year`     | Accordion: year card, term cards with date pickers                        | Two-column layout                                        | Add term                | "No year" → wizard                          | Skeleton          | Retry                               |
| Rooms                 | `/app/settings/academics/rooms`    | Simple list                                                               | Table                                                    | Add room                | "No rooms — rooms are optional"             | Skeleton          | Retry                               |
| Setup wizard          | `/app/settings/academics/setup`    | Full screen, one step per screen, progress bar, sticky bottom bar         | Centred 720 px card, same steps                          | Continue / Create       | n/a                                         | Per-step skeleton | Per-step error map, no data loss    |

`packages/ui` components used: `AppShell`, `PageHeader`, `DataList`, `FormSheet`, `WizardShell`, `Stepper`, `MemberPickerSheet`, `CountStat`, `EmptyState`, `ConfirmSheet`, `Tabs`, `Badge`, `Banner`. All colours and spacing come from tokens; grade chips use the token palette only.

## 7. Server contracts

All actions live in `apps/web/app/(school)/app/classes/_actions.ts` and `.../settings/academics/_actions.ts`; schemas in `packages/contracts/academics.ts`; data access in `packages/db/repositories/academics.ts`. Every action: resolve `WorkspaceContext` → `can(ctx.role, '<key>')` → Zod `parse` → repository → `Result<T, ApiError>`.

| Action / handler               | Input schema (Zod)                                                                                                                          | Output                                                                              | Errors                                                   | Idempotency                           | Rate limit |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- | ---------- |
| `createAcademicYear`           | `CreateAcademicYearInput` {name, startsOn, endsOn, board?, terms: TermInput[]}                                                              | `AcademicYear`                                                                      | `YEAR_NAME_TAKEN`, `TERM_OVERLAP`, `DATE_RANGE_INVALID`  | key on (workspace, name)              | 20/h/user  |
| `updateAcademicYear`           | `UpdateAcademicYearInput`                                                                                                                   | `AcademicYear`                                                                      | `YEAR_CLOSED`                                            | —                                     | 60/h       |
| `setCurrentAcademicYear`       | `SetCurrentYearInput` {yearId}                                                                                                              | `AcademicYear`                                                                      | `YEAR_NOT_ACTIVE`                                        | —                                     | 20/h       |
| `closeAcademicYear`            | `CloseYearInput` {yearId, confirm: true}                                                                                                    | `AcademicYear`                                                                      | `OPEN_EXAMS_EXIST` (warn-confirm), `YEAR_NOT_ACTIVE`     | —                                     | 5/h        |
| `upsertTerm`                   | `TermInput` {id?, yearId, name, sequence, startsOn, endsOn}                                                                                 | `Term`                                                                              | `TERM_OVERLAP`, `TERM_OUTSIDE_YEAR`                      | —                                     | 60/h       |
| `upsertGradeLevel`             | `GradeLevelInput` {id?, code, name, nameBn?, ordinal}                                                                                       | `GradeLevel`                                                                        | `CODE_TAKEN`                                             | —                                     | 60/h       |
| `seedBdGradeLevels`            | `SeedGradesInput` {board}                                                                                                                   | `{created: number}`                                                                 | `ALREADY_SEEDED`                                         | key on (workspace, 'grade-seed')      | 3/h        |
| `createSection`                | `CreateSectionInput` {yearId, gradeLevelId, name, capacity?, classTeacherId?, roomId?, shift?, stream?, copySubjectsFromGrade = true}       | `Section`                                                                           | `SECTION_NAME_TAKEN`, `MEMBER_NOT_ACTIVE`, `YEAR_CLOSED` | key on (year, grade, name)            | 60/h       |
| `updateSection`                | `UpdateSectionInput`                                                                                                                        | `Section`                                                                           | `SECTION_ARCHIVED`, `CLASS_TEACHER_TAKEN`                | —                                     | 120/h      |
| `archiveSection`               | `ArchiveSectionInput` {sectionId}                                                                                                           | `Section`                                                                           | `SECTION_HAS_STUDENTS`                                   | —                                     | 30/h       |
| `upsertSubject`                | `SubjectInput` {id?, code, name, nameBn?, category, isOptional, countsInGpa, credit, defaultFullMarks}                                      | `Subject`                                                                           | `CODE_TAKEN`                                             | —                                     | 60/h       |
| `seedDefaultSubjects`          | `SeedSubjectsInput` {board}                                                                                                                 | `{created: number}`                                                                 | `ALREADY_SEEDED`                                         | key on (workspace, 'subject-seed')    | 3/h        |
| `setGradeSubjects`             | `SetGradeSubjectsInput` {yearId, gradeLevelId, subjects: [{subjectId, isOptional, fullMarks, passMarks}], applyToExistingSections: boolean} | `{sectionSubjectsCreated: number}`                                                  | `YEAR_CLOSED`                                            | —                                     | 60/h       |
| `assignSectionSubjectTeachers` | `AssignSectionSubjectTeachersInput` {sectionSubjectId, primaryTeacherId?, assistantIds: string[]}                                           | `SectionSubject`                                                                    | `MEMBER_NOT_ACTIVE`, `TOO_MANY_ASSISTANTS`               | —                                     | 120/h      |
| `bulkAssignSubjectTeacher`     | `BulkAssignTeacherInput` {subjectId, teacherId, sectionIds: string[]}                                                                       | `{updated: number}`                                                                 | `MEMBER_NOT_ACTIVE`                                      | key required                          | 30/h       |
| `updateSectionSubjectOwn`      | `UpdateSectionSubjectOwnInput` {sectionSubjectId, periodsPerWeek?, notes?}                                                                  | `SectionSubject`                                                                    | `NOT_PRIMARY_TEACHER`                                    | —                                     | 120/h      |
| `upsertRoom`                   | `RoomInput` {id?, name, code?, type, capacity?, building?, floor?}                                                                          | `Room`                                                                              | `ROOM_NAME_TAKEN`                                        | —                                     | 60/h       |
| `runAcademicSetup`             | `AcademicSetupInput` (whole wizard payload, validated as one object)                                                                        | `AcademicSetupResult` {yearId, counts}                                              | `SETUP_ALREADY_DONE`, per-step issue list                | **key required** (`idempotency_keys`) | 5/h        |
| `GET /api/academics/structure` | `StructureQuery` {yearId?}                                                                                                                  | `StructureSnapshot` (grades → sections → subject counts), cached 60 s per workspace | —                                                        | —                                     | 600/h      |

Typed read selectors exported for other features: `listSections(ctx, {yearId, gradeLevelId?})`, `getSectionSubjects(ctx, sectionId)`, `listTeachingAssignments(ctx, memberId)`, `resolveCurrentYearAndTerm(ctx)`.

## 8. Parts (build chunks)

**Part 1 — Years and terms** · migration for `academic_years` + `terms` (enums, exclusion constraint, RLS, audit trigger), `app.current_term()`, contracts, `createAcademicYear` / `upsertTerm` / `setCurrentAcademicYear` / `closeAcademicYear`, the year settings screen · files: `supabase/migrations/*_academic_years.sql`, `packages/contracts/academics.ts`, `packages/db/repositories/academics.ts`, `app/(school)/app/settings/academics/year/*` · tests: pgTAP overlap + tenant isolation, unit tests for current-term resolution across Asia/Dhaka midnight and vacation gaps · **Demo:** create "2026" with three terms on a phone; the app header shows "2026 · 1st Term".

**Part 2 — Grade levels and the Bangladesh seed** · `grade_levels`, ordinal/stage derivation, the 16-grade seed with Bengali names, grade list screen · tests: ordering unit test, seed idempotency, no cross-tenant seed reference · **Demo:** a new school taps "Use Bangladesh defaults" and sees Play → Class 12 in the correct order.

**Part 3 — Sections and rooms** · `sections` + `rooms`, class-teacher assignment with the uniqueness rule, `student_count` trigger (against a stub enrollments table), section list + section detail shell with tabs · tests: pgTAP unique (year, grade, name), role escalation, trigger test · **Demo:** create Class 6 – A with a class teacher and a room; it appears under Class 6 showing "0 students".

**Part 4 — Subjects and grade-subject templates** · `subjects`, `grade_level_subjects`, NCTB seed, subjects catalogue screen, per-grade subject sheet with the "apply to existing sections" action · tests: seed copies into the tenant; optional/GPA flags round-trip · **Demo:** seed 14 subjects and set Class 9's subject set including Higher Mathematics as optional.

**Part 5 — Section subjects and teaching assignments** · `section_subjects` + `section_subject_teachers`, auto-copy on section create, assignment sheet, bulk-assign by subject, "unassigned subjects" banner, member-removal orphaning trigger, `academics.assigned_subject` / `academics.subject_unassigned` notifications · tests: unit for eligibility, pgTAP for the primary-teacher own-row update policy, integration for the orphaning trigger · **Demo:** assign Mr. Rahman to Mathematics in 6A/6B/7A in three taps; his dashboard lists "My subjects".

**Part 6 — Bulk setup wizard** · `runAcademicSetup` transactional action with idempotency, seven-step `WizardShell`, review counts, audit correlation id, draft resume · tests: integration creating 22 sections × 14 subjects in one transaction, replay with the same key, e2e at 360×800 · **Demo:** a fresh school goes from zero to 22 sections and 308 section-subjects in under ten minutes on a phone, with one audit correlation id covering every insert.

## 9. Acceptance criteria

1. **Given** a new school with no academic year, **when** an admin opens `/app/classes`, **then** the empty state offers "Set up your school" and every other academics screen shows the same CTA instead of a broken list.
2. **Given** the setup wizard completed with Class 1–10 × A,B and 14 subjects, **when** it finishes, **then** exactly 20 `sections` and 280 `section_subjects` rows exist, all with `workspace_id` set, and a single `audit_events.correlation_id` groups every insert.
3. **Given** an active year "2026" marked current, **when** an admin marks "2027" current, **then** "2026" becomes non-current in the same transaction and no second current row can exist.
4. **Given** term 1 spans 1 Jan–30 Apr, **when** an admin saves term 2 as 15 Apr–31 Jul, **then** the save is rejected with `TERM_OVERLAP` and the start-date field is highlighted.
5. **Given** a section with 38 active enrollments, **when** an admin taps Archive, **then** it is refused with `SECTION_HAS_STUDENTS` and the sheet links to "Move students".
6. **Given** a subject referenced by existing marks, **when** an admin opens its row, **then** Delete is not offered, Archive is, and historic mark sheets still render the subject name.
7. **Given** a teacher is primary teacher of 3 section_subjects and class teacher of one section, **when** their membership becomes `removed`, **then** all four references are nulled, admins get one `academics.subject_unassigned` notification listing them, and no marks or attendance rows change.
8. **Given** an admin on a 360×800 phone, **when** they add a section, **then** every field and the submit button are reachable one-thumb (sheet with sticky bottom action, targets ≥ 44 px) with no horizontal scrolling.
9. **Given** `school_profiles.working_days` is Sat–Thu, **when** any structure screen renders a week, **then** it renders Sat–Thu.
10. **Given** a signed-in teacher, **when** they open `/app/classes`, **then** they can read all sections and no create/edit control is rendered; a direct `createSection` call is refused by both the permission check and RLS.
11. **Given** two workspaces that both have "Class 6 – A", **when** a member of workspace A lists sections, **then** only A's rows return; pgTAP asserts this for every table in §3.
12. **Given** a closed academic year, **when** anyone attempts to create a section or change a subject set inside it, **then** the action fails with `YEAR_CLOSED`.
13. **Given** a member who is already class teacher of Class 6 – A in 2026 and `allow_multi_class_teacher = false`, **when** an admin assigns them to Class 7 – B, **then** the save is refused with `CLASS_TEACHER_TAKEN`.

## 10. Tests

- **Unit (`packages/domain`, Vitest, ≥ 80 %)**: `gradeOrdinalToStage`, `sectionDisplayName`, `currentTermFor(date, terms, tz)` including Asia/Dhaka midnight and vacation gaps, `teacherEligibility`, `capacityWarning`, and the pure `setupPayloadToInsertPlan` function (snapshot-tested for a 22-section school).
- **DB (pgTAP)**: per table — tenant isolation, role escalation (teacher cannot insert/update/delete; teacher _can_ update only `periods_per_week`/notes on own `section_subjects`), `workspace_id` immutability, every unique constraint, the term exclusion constraint, the `is_current` partial index, `on delete restrict` from dependants, the `student_count` trigger, the member-removal orphaning trigger, and the audit trigger's before/after payload.
- **Integration (server actions)**: happy path plus each named error for every action; `runAcademicSetup` replayed with the same idempotency key yields one year; two concurrent `setCurrentAcademicYear` calls leave exactly one current row.
- **E2E (Playwright at 360×800 and 1280×800, `@axe-core/playwright`)**: `academics-setup-wizard`, `add-section-and-assign-teacher`, `teacher-read-only-structure`. Zero serious/critical axe violations on all seven screens.
- **Performance budgets**: `/app/classes` TTFB < 400 ms with 30 grades / 200 sections; `GET /api/academics/structure` p95 < 150 ms (one query + 60 s cache); the setup transaction for 22 sections × 14 subjects completes in < 2 s.

## 11. Open questions

1. **Multi-shift schools** (morning and day shifts with separate rosters). Assumed: `sections.shift` is a label only; attendance and timetable are per section, so shifts need no extra modelling. If a school needs shift-level bell schedules, it moves to F-AC-05.
2. **Streams for Class 9–12.** Assumed: a `sections.stream` label plus a different subject set per section. If a student must pick a stream independently of their section, it becomes a student-level field in F-AC-02.
3. **Combined-grade classrooms** in very small schools (Class 1 and 2 taught together). Assumed out of scope: create two sections and one timetable.
4. **Madrasah ladder** (Ebtedayee → Dakhil) grade names and ordinals. Assumed: the NCTB ladder ships first; the Madrasah seed waits for owner confirmation of the exact class names.
5. **Section renaming mid-year.** Assumed allowed, since it is a label and history keeps the FK. Printed documents snapshot the section name at publish time (F-AC-06), so renames never alter an issued mark sheet.

### Status / deviations recorded 2026-09-25 (demo cut, D-102)

- **Built:** `sections` and `subjects` (migration `20260925300304_sections_and_subjects.sql`, pgTAP `32_sections_and_subjects.sql`), `/app/classes` with a card per grade (add section with class teacher, room, capacity; archive) and a Subjects tab (add subject; "Use the NCTB starter list"), in English and Bangla. Grade levels and the current academic year come from the create-school wizard (F-ID-05 Part 4, D-100).
- **Deviations from §3:** `sections.room` is text until `rooms` exists; no `shift`, `stream`, `student_count` or `is_active` yet (archive via `archived_at`); `subjects` has no `counts_in_gpa`, `credit`, `default_full_marks` or `colour` yet. `grade_levels` uses `level_number`/`stage` (D-100), not `code`/`ordinal`. Section names are unique ignoring case.
- **Not built yet:** terms and `app.current_term()` (Part 1), rooms (Part 3), `grade_level_subjects` (Part 4), section-subjects and teacher assignments (Part 5), the setup wizard (Part 6), the grade detail and section detail routes (the demo cut shows everything on `/app/classes`).
- **Review follow-ups (PR #47):** the §4.5 orphaning trigger ships for class teachers (section-subject teachers come with Part 5); sections and subjects are archive-only; the starter list uses per-paper Bangla/English and per-faith religion subjects; Bangla schools get ক/খ section suggestions. Journey `apps/web/e2e/journeys/add-section-and-assign-teacher.spec.ts` (skip-gated on OQ-27).
