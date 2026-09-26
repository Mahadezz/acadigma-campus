# @acadigma/domain

## 0.9.0

### Minor Changes

- 2885f6a: F-OP-03 Part 6, demo cut (D-208): two new report kinds on the existing PDF engine and run pipeline. The **monthly attendance register** (`attendance_register`) prints one section's whole month landscape, every calendar day as a column, non-school days greyed, per-student P/A/L/E/H codes with totals and percentages, per-day present counts, the school's own late/half-day policy in the legend, and an "n days not yet taken" banner. The **exam mark sheet** (`mark_sheet`) prints one section x exam landscape, students x papers, with totals/GPA/grade/rank from F-AC-06's already-computed results — a student without a computed result still gets a row and prints "Incomplete"/"অসম্পূর্ণ"; an exam with no computed results at all fails the run with a clear "compute results first" message. New permissions `report.render.attendance_register` and `report.render.mark_sheet` (owner/admin/teacher, not staff). `attendance_register_signoffs` (sign/countersign/lock) is explicitly deferred, not tiny — see D-208.

### Patch Changes

- Updated dependencies [2885f6a]
  - @acadigma/contracts@0.9.0

## 0.8.0

### Minor Changes

- a900e6f: F-AC-02 Part 4 (D-108): guardian linking. On a student's profile an owner or admin can invite a guardian to the parent app: a single-use link for that child (30 days) to copy or send on WhatsApp. The guardian signs in or registers, sees the school and child, and accepts; they become a parent of the school linked to that child only, and `/family` lists the child and their published results. Owners and admins can remove a parent's access, which ends at once. Adds the `students.guardian.invite` permission.
- 8d87ebf: F-AC-06 Part 4 (D-307): submitting, locking and the marks entry window. A paper's teacher (or an owner/admin) presses "Submit marks"; if students are still missing, a sheet lists them and "Submit anyway" submits regardless. Owners and admins see "Marks progress" on the exam page — each paper's teacher, marked count and status — and lock a submitted paper or unlock it with a reason (audited; unlocking a marks-locked exam sends it back to marks entry and clears its results). Each paper has entry dates (default: the exam date to 7 days after); outside them teachers cannot change marks, and an owner/admin can only with a reason, which is recorded and marks the change as late. Adds the `marks.lock` permission.
- a900e6f: F-AC-06 Part 7 (D-306): publishing results. "Publish" on a marks-locked exam opens a sheet to withhold students (each with a reason); `publishResults` refuses until marks are complete and every result is computed and complete, then freezes each student's report card in the database so a later rename can never change what a family was shown. Unpublishing (with a reason) hides results again and is audited. Parents see their own linked children's published, non-withheld results on `/family`, with "Download report card". Adds `guardian_users` (parent ↔ child links; the invite flow that creates them comes with F-AC-02 Part 4) and the `results.publish` and `family.results.read` permissions.
- 9c49976: F-ID-10 Part 2 (D-405): the real basic-mode home. `/app/home` replaces Part
  1's placeholder with a today strip (greeting, "N roll calls not taken"), one
  `ClassBlock` per class the teacher is assigned to (F-AC-01 Part 5's
  `listMySections` — class teacher, subject teacher, or both), an "All
  classes" block for owner/admin, and an essentials row. `BasicShell`
  (no sidebar/bottom nav, Home + brand + Help) now applies to the whole `/app`
  shell whenever `ui_mode=basic`, not only `/app/home` — a deep link into a
  full-app page still opens inside it. Tapping a class opens the existing roll
  call; the class hub is Part 3. New primitives: `BasicShell`, `ClassBlock`,
  `TodayStrip`, `HelpSheet` (`packages/ui`, catalogued in DESIGN-SYSTEM §4.13).
  New `/app/classes/all`, a searchable list of every live section for
  owner/admin.

  Also: `signInWithPassword` now deletes both display-preference cookies
  (instead of leaving a stale one) when the signing-in user's preferences row
  cannot be read — closing the other half of #64's shared-device fix.

  **Review batch (D-405 addendum):** the essentials row gains Sign out and a
  language switch (basic mode has no `UserMenu`, which was the only other
  place either lived) and drops Profile (no dedicated screen exists to link
  to); `HelpSheet`'s close control is now a full-width "ফিরে যান / Go back"
  button, not a 16px English-only "✕"; `packages/ui`'s `buttonVariants` moves
  to a radix-free `components/button-variants.ts` so server files compute
  real button classes instead of a drifted literal-string copy; the basic-mode
  layout's `getSchoolProfile` request waterfall is fixed with a
  `React.cache()`-wrapped loader; the home error state is localised with a
  Retry link; the Help catalogue gets a marks-entry line.

### Patch Changes

- Updated dependencies [a900e6f]
- Updated dependencies [8d87ebf]
- Updated dependencies [a900e6f]
- Updated dependencies [9c49976]
  - @acadigma/contracts@0.8.0

## 0.7.0

### Minor Changes

- ab3b1eb: F-AC-06 Part 7 (D-306): publishing results. "Publish" on a marks-locked exam opens a sheet to withhold students (each with a reason); `publishResults` refuses until marks are complete and every result is computed and complete, then freezes each student's report card in the database so a later rename can never change what a family was shown. Unpublishing (with a reason) hides results again and is audited. Parents see their own linked children's published, non-withheld results on `/family`, with "Download report card". Adds `guardian_users` (parent ↔ child links; the invite flow that creates them comes with F-AC-02 Part 4) and the `results.publish` and `family.results.read` permissions.
- d4e2480: F-AC-06 Part 5 (D-305): results and section rank computed in SQL. `public.compute_results` (owner/admin, marks locked and complete) replaces an exam's `results` and `result_subject_lines` in one transaction from the exam's grading snapshot — paper percentage to 2 decimals with no rounding before banding, absent fails the paper, exempt is left out, an F zeroes the GPA, `rank()` per section by GPA, total, percentage. "Compute results" on the exam page and a results preview per section (`/app/exams/[id]/results`). `computeResults` in `@acadigma/domain/grading` is the TypeScript reference, held to the same golden fixture as the SQL. F-OP-03's report card (`getReportCardData`) reads real results; its fixture is removed and the button moves to each preview row.
  A missing roll number or attendance prints "—" on the report card; a student with a paper not yet marked is `incomplete` (no GPA, no rank) instead of blocking the whole exam.
- 5996a98: F-OP-03 Part 5 bulk report cards, demo cut (D-207): owners, admins and teachers render one merged A4 PDF of every student's report card in a section for one exam, ordered by roll or name, with duplex padding so every card starts on an odd page when "print both sides" is on. New `report_card_bulk` report kind on the existing run pipeline (synchronous, D-205's precedent); a per-student failure is recorded as a `report_run_items` row without failing the run. New permission `report.render.report_card_bulk` (owner/admin/teacher, not staff). Security hardening: `report_runs`/`report_run_items` SELECT now restrict staff to `report_card` runs at the RLS layer itself (defence in depth, #63 review).

### Patch Changes

- Updated dependencies [ab3b1eb]
- Updated dependencies [d4e2480]
- Updated dependencies [db0cd58]
- Updated dependencies [5996a98]
  - @acadigma/contracts@0.7.0

## 0.6.0

### Minor Changes

- 07780bc: F-AC-02 §4.7 bulk student import, demo cut (D-106): owners and admins upload an Excel (.xlsx) or CSV register from a bilingual template, see every bad row by line and column in plain English or Bangla, and import the valid rows — each through `admit_student`, idempotent per batch and row — with the report kept in `student_import_batches`. Re-uploading a register skips students already on the roster; `.xlsx` files that would unpack too large are refused. New permission `students.import`.
- 9e5421e: F-ID-10 Part 1 (D-403, D-404): basic-mode display preferences. `user_preferences.ui_mode`/`text_size` (added to the existing table, not a new one), `updateUiPreferences`/`getUiPreferences`, non-httpOnly cookie mirrors, `<html data-text-size data-ui-mode>` rendered server-side for a no-flash first paint, `/app/settings/display` (text-size radio cards + basic-mode switch, hidden for staff), "Switch to basic mode" in the full app's user menu, and a minimal `/app/home` placeholder so turning basic mode on and switching back both work end to end. The class-by-class home and class hub are F-ID-10 Parts 2-3.
- 4a954d2: F-OP-03 Part 3 (D-206) — the report card ("প্রগতিপত্র" / "Progress Report") on the Parts 1-2 PDF engine. New `ReportCardDocument` in `@acadigma/pdf`: one A4 portrait layout, Bengali (Hind Siliguri) + English, subject table with marks/grade/GPA, totals, attendance summary with a below-minimum warning line, class-teacher/guardian signature lines. Bengali numerals render on the card only (DESIGN-SYSTEM §1.6). Grade letters/GPA come from `@acadigma/domain`'s `bandFor`/`BD_GRADE_BANDS` (the #46/D-302 grade scale) — `packages/pdf` still contains no grade-band logic of its own (spec §5.1).

  New `ReportCardDto`/`ReportCardParams` contracts (`@acadigma/contracts`). `report_kind` gains `'report_card'` (additive `alter type ... add value`, no shape change to `report_runs`; `42_report_card_kind.sql`). An incomplete or withheld result prints "অসম্পূর্ণ — ফলাফল স্থগিত" and hides totals, GPA, grade and rank; absent subjects print "অনুপস্থিত", the 4th subject and tied ranks are marked. New `report.render.report_card` permission (owner, admin, staff, teacher); the download route checks it too. `createReportRun` and `GET /api/pdf/[runId]` both render the new kind.

  Real exam/marks data (F-AC-06 marks entry) is not on `main` yet, so the render source is a 40-student Class 6-ক fixture behind one seam function (`getReportCardData`) — swapping in the real `results` read (F-AC-06 Part 5) touches only that function's body, not the DTO, params or any caller. The fixture never serves in production, and the demo button is hidden there.

### Patch Changes

- Updated dependencies [07780bc]
- Updated dependencies [9e5421e]
- Updated dependencies [4a954d2]
  - @acadigma/contracts@0.6.0

## 0.5.0

### Minor Changes

- 189fb24: F-AC-06 Part 3 demo cut (D-304): marks entry. `marks` table and `public.save_marks` (the only writer: the paper's teacher, the class teacher or an owner/admin, only while the exam is in marks entry and the paper is not locked; idempotent; per-row version check and range check so valid rows still save). `/app/marks/[examSubjectId]` is the phone-first entry screen (72 px rows, big numeric input, Enter to the next student, Absent/Exempt chips, sticky "24/40 · Save"; ↑/↓, Esc, A, E and Ctrl+S on desktop). Exam papers get a subject teacher and a marks progress count. Publish is refused until every enrolled student in every paper has a mark, or is absent or exempt.

### Patch Changes

- 8d112a1: F-AC-03 follow-ups (D-105): any active teacher may take any section's attendance (substitutes cover); the class list for a date follows `enrolled_on`/`ended_on`; a saved roll call no longer re-stamps "Mark all present"; names render through `BnEnText`; the unused `sectionDayRate` is removed.
- Updated dependencies [189fb24]
  - @acadigma/contracts@0.5.0

## 0.4.0

### Minor Changes

- d704c7e: F-AC-03 demo cut (D-104): daily attendance. `public.save_attendance` is the only writer (class teacher or owner/admin, edit window, school days, exactly the enrolled students, audited "Mark all present", no silent overwrite); `/app/attendance` shows today's classes marked / not marked with the school's rate, `/app/attendance/[sectionId]` is the one-thumb roll call; the dashboard's attendance slot shows today's rate.
- d1f6cca: F-AC-01 demo cut (D-102): `sections` and `subjects` with T2 RLS, tenant-bound foreign keys and read-only guards; `/app/classes` lists each grade's sections for the current year (add with class teacher, room, capacity; archive) and the subject catalogue (add; copy the NCTB starter list), in English and Bangla.
- 932f920: F-AC-06 Part 2 (demo cut, D-303): exams. Migration `20260925300305_exams.sql` adds
  `exams`, `exam_sections` and `exam_subjects`, a grading snapshot written at creation and
  never changed afterwards, the §5.12 status chain enforced in the database, and
  `public.create_exam`. `@acadigma/domain/academic` adds `checkExamTransition`,
  `nextExamStatus`, `reversalFrom` and `defaultPassMarks`; there are new contracts and an
  exams repository; new permissions `exams.read` and `exams.write`. New screens:
  `/app/exams` (list and "New exam") and `/app/exams/[id]` (status actions, reasons for
  reversals, and editing each paper's date, full marks and pass marks).
- 4091c9e: F-AC-02 demo cut (D-103): students, their private details (date of birth), guardians and enrolments, with the sensitive fields readable only by owner/admin and the class teacher; `public.admit_student` admits a student, guardian and enrolment in one transaction. `/app/students` searches the roster by English or Bangla name or student ID with a class filter and a quick-admit sheet; `/app/students/[id]` shows the profile, with date of birth and guardians locked for other roles.
- 5b4dbd6: F-OP-03 Parts 1-2 — the print/PDF engine. New `@acadigma/pdf` package: a
  `@react-pdf/renderer` document shell (letterhead header reading
  `school_profiles` through the existing `renderHeaderLine`, footer with real
  page numbers, watermark, signature block), Inter + Hind Siliguri embedded
  from disk (D-204 — Hind Siliguri over the spec's original Noto Sans Bengali
  default, to match DESIGN-SYSTEM/acadigma-website), locale-aware
  `formatNumber`/`formatDate`/`formatDateTime` (Bengali numerals opt-in), and
  a golden test proving Bengali conjuncts ("ক্ষ") and two schools' letterheads
  render correctly from real PDF bytes.

  The run pipeline (`report_runs`/`report_run_items`, migration + RLS +
  pgTAP `40_report_runs.sql`): `createReportRun` (parse -> context -> `can()`
  -> plan entitlement -> `requireWritable` -> repository -> render, D-300
  compliant) and `GET /api/pdf/[runId]` (parse -> context -> `can()` -> fetch
  via the caller's own RLS-scoped client -> render), both with route/action
  auth tests. `report_kind` ships with one value, `'sample'`, the pipeline's
  own proof (D-205) — no fake report-card data, since exam/marks tables do not
  exist yet. No `files`/Storage row is created in this PR (D-205); the
  download route re-renders deterministically instead. `/app/reports` and
  `/app/reports/runs/[id]` are new, minimal pages behind the existing
  `reports` plan-module entitlement (Starter+).

### Patch Changes

- baa055e: The audit trail reads as plain sentences in English and Bengali: "Nusrat added a holiday", "updated a school setting". No table names, no empty "()", and unknown actions read "made a change".
- Updated dependencies [d704c7e]
- Updated dependencies [d1f6cca]
- Updated dependencies [932f920]
- Updated dependencies [4091c9e]
- Updated dependencies [ba295f3]
- Updated dependencies [5b4dbd6]
  - @acadigma/contracts@0.4.0

## 0.3.0

### Minor Changes

- c1a5060: F-AC-06 Part 1: grade scales (D-302). Migration `20260925300302_grade_scales.sql` adds
  `grade_scales` / `grade_bands` with a no-gap/no-overlap coverage trigger,
  `app.band_for` / `app.round_half_up`, and the `seed_bd_grade_scale` / `save_grade_scale`
  RPCs. `@acadigma/domain/grading` (`bandFor`, `roundHalfUp`, `checkCoverage`,
  `BD_GRADE_BANDS`) matches SQL on one parity table. New permission
  `settings.grade_scale.write` (owner/admin). New screen `/app/settings/grade-scale`: the
  one-tap Bangladesh default and a live "72 % → A (4.00)" preview.
- 762259e: F-AC-11 School calendar, Part 1 demo cut (D-202): holidays, working-day overrides and `app.is_school_day`.

  - Migration `20260925300301_school_calendar.sql`: `holidays`, `working_day_overrides` (RLS, freeze, audit, read-only guard) and `app.is_school_day` / `app.school_days` / `app.school_day_count` (override > weekly pattern > holiday); pgTAP `41_school_calendar.sql`.
  - `packages/contracts/src/calendar.ts`: `createHolidayInputSchema`, `deleteHolidayInputSchema`, `Holiday`.
  - `packages/db/src/repositories/calendar.ts`: `listHolidays`, `createHoliday`, `deleteHoliday`.
  - `packages/domain`: `calendar.holiday.write` (owner/admin); `holidays` and `working_day_overrides` in the generic audit catalogue.
  - `/app/settings/calendar`: the holiday list; owners and admins can add and remove holidays.

- a8fa0cd: The school dashboard is real (D-400): owners and admins see their school, plan and trial days left, members by role, the staff-directory count, a setup checklist and recent audit activity. Attendance and exam results are empty slots until those features ship. Teachers get a lighter view. Everything is available in English and Bengali.
- 0f2fce6: F-ID-05 Onboarding, Part 4: the create-school wizard's classes and review steps, and the transaction that creates the school (D-100).

  - Migration `20260925300101_create_school_workspace.sql`: `grade_levels` and `academic_years` (T2 RLS), and `public.create_school_workspace(jsonb)` — one SECURITY DEFINER transaction that creates the school (owner, join code, Pro trial via the existing triggers), its profile, current academic year and grade levels, completes onboarding, and records an idempotency key; the only way to create a school (the client INSERT on `workspaces` is removed); input validated before the EIIN is tried and every attempt counted in a `createSchool` throttle bucket; named errors `EIIN_TAKEN`, `RATE_LIMITED` (3 per day, 30 attempts per 15 min), `INVALID_TIMEZONE`, `INVALID_ACADEMIC_YEAR`, `VALIDATION`, `WORKSPACE_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REUSED`. `supabase/tests/30_create_school_workspace.sql`.
  - `packages/domain/src/academic/gradeLevels.ts`: presets (Play–KG, Class 1–12, O/A-Level), ordering, Bangla names, range shortcuts, custom levels.
  - `packages/contracts`: `gradeLevelsSchema`, `createSchoolWorkspaceInputSchema`/`Output`; the draft carries `grade_levels` and `idempotency_key`.
  - `packages/db`: `createSchoolWorkspace` repository with the error mapping.
  - `apps/web`: `createSchoolWorkspace` action (sets the active-workspace cookie, lands on `/app`); wizard step 3 (classes) and step 4 (review and create), en + bn; 44 px inputs on steps 1-2.
  - `packages/ui`: `OnboardingShell` takes a localised `progressLabel`.
  - Settings: the EIIN is read-only in the school profile form (set at creation; support changes it), matching the database guard.

- 235470f: F-OP-07 School settings, Part 1 remainder (D-200): `/app/settings` (grouped rows with search), the read-only "How this school works" page for every member, the school profile form and branding with a live report-card header preview.

  - `packages/contracts/src/settings.ts`: `schoolProfileFieldsSchema`, `schoolTypeSchema`, `updateSchoolProfileInputSchema`, `updateBrandingInputSchema` (version = `updated_at`). `./identity/school` is now an export subpath.
  - `packages/domain/src/settings/header.ts`: `renderHeaderLine` / `unknownHeaderTokens` for `{token}` header lines.
  - `packages/db/src/repositories/settings.ts`: `getSchoolProfile`, `updateSchoolProfile` with optimistic concurrency (a stale version returns `conflict`, nothing is overwritten) and a duplicate-EIIN `conflict` on the `eiin` field.
  - `apps/web/app/(school)/app/settings/profile-actions.ts`: `updateSchoolProfile` / `updateBranding`: owner/admin only, `requireWritable` before any write, unknown header tokens refused.
  - `packages/ui/src/components/ui/native-select.tsx` (new, shadcn `new-york-v4`).

### Patch Changes

- Updated dependencies [c1a5060]
- Updated dependencies [762259e]
- Updated dependencies [137ac19]
- Updated dependencies [0f2fce6]
- Updated dependencies [235470f]
- Updated dependencies [4801338]
  - @acadigma/contracts@0.3.0

## 0.2.0

### Minor Changes

- 48488b0: F-ID-05 Onboarding, Part 3: the create-school wizard's steps 1-2 (identity, where-and-when).

  - Migration `20260925000700_school_eiin_availability.sql` (D-66): a partial unique index on `school_profiles.eiin`, plus `public.check_eiin_available(text)` — a `SECURITY DEFINER` boolean-only probe the wizard calls before a school (or any membership) exists for the caller; `supabase/tests/22_school_eiin_availability.sql`.
  - `packages/contracts/src/identity/school.ts`: the real `CreateSchoolDraft` schema (board/medium enums, EIIN format, IANA timezone, working days, academic-year shape) and the step 1/step 2 submission schemas. `onboardingDraftSchema` (`identity/onboarding.ts`) now validates against this shape, `.partial()` and `.passthrough()`, in place of Part 2's placeholder JSON bag.
  - `packages/domain/src/academic/year.ts`: `validateAcademicYearRange` (1-730 days, `ends_on > starts_on`) and `deriveFirstDayOfWeek` (Sat-first order).
  - `packages/db/src/repositories/school.ts`: `checkEiinAvailability`. `onboarding.ts`'s `saveOnboardingDraft` now always clears `onboarding_progress.completed_at` (D-60 follow-up: a fresh draft after a prior completion is resumable again).
  - `packages/ui/src/primitives/onboarding-shell.tsx` gains an `onBack` handler for in-page step navigation, plus a forwarded ref to its `<h1>` so a step transition can move focus to it.

  **PR #34 review follow-ups** (D-67):

  - Migration `20260925000800_throttle_eiin_check_bucket.sql`: `public.throttle_record_failure` gains an `eiinCheck` bucket (30 attempts / 15 min / 15 min block, per user id) — `checkEiinAvailability` was previously unthrottled, letting a signed-in account enumerate which EIINs are already on the platform.
  - `packages/ui/src/components/ui/toggle.tsx` / `toggle-group.tsx` (new, shadcn `new-york-v4`): the wizard's medium picker and working-days picker now use `ToggleGroup` (`type="single"` / `type="multiple"`) instead of the hand-rolled `segmented-control.tsx` / `day-picker-row.tsx` (removed) — Radix's roving tabindex also fixes a REACT HIGH finding (`SegmentedControl` gave every option `tabIndex=0` before a value was chosen). The timezone field is now a shadcn combobox (`Command` inside `Popover`, real search) with `Asia/Dhaka` pinned first, replacing the plain ~400-entry `Select` (OPUS 3: unusable on touch). `primitives/date-field.tsx` (removed) is a plain `Input type="date"` inside `FormControl`.
  - `wizard.tsx`: focuses each step's `<h1>` on mount (REACT HIGH: no focus management on step change); `backLabel` is now threaded through from `common.actions.back` (OPUS 1: Bengali saw the hardcoded English default); the `eiinChecking` message is wired to a live async state instead of sitting unused; the "Use {timezone}" button, EIIN helper `<summary>` and the "contact support" link all gained `min-h-11` (OPUS 2, 44px touch targets); the academic-year date range's manual cross-field error is now a real RHF error (`form.setError`/`clearErrors`) so it both has a valid described-by id and clears itself the moment either date is edited (OPUS 6).

- 98e5a8e: F-ID-05 Onboarding, Part 2: the `/onboarding` shell, chooser and state.

  - Migration `20260925000300_onboarding_progress.sql`: `onboarding_progress` (one row per user, resumable wizard state), class-U1 RLS with no DELETE at all and an added platform-staff SELECT branch for support; `supabase/tests/17_onboarding_progress.sql` (cross-user isolation, no-delete grant, platform-staff read, the `updated_at` trigger).
  - `packages/contracts/src/identity/onboarding.ts`: `getOnboardingState`/`saveOnboardingDraft`/`completeOnboarding` schemas; the wizard draft stays a size-capped JSON bag until Parts 3-4 introduce the real `CreateSchoolDraft` shape.
  - `packages/domain/src/onboarding/`: three pure, unit-tested functions — `resolveOnboardingAccess` (the redirect matrix), `resolveOnboardingChooserView` (fresh vs. resume), `resolveOnboardingExitRoute` (F-ID-05 §4.5's landing table).
  - `packages/db/src/repositories/onboarding.ts`: `getOnboardingProgress`, `saveOnboardingDraft`, `markOnboardingComplete` — all keyed on the caller's own `userId`, never a `WorkspaceContext` (onboarding runs before any membership exists).
  - `packages/ui/src/primitives/onboarding-shell.tsx` and `choice-card.tsx`: the frame and the 120px option cards every onboarding screen (this Part's chooser, and Parts 3-4's wizard) render inside.
  - `apps/web/app/(onboarding)/`: the chooser at `/onboarding` — two `ChoiceCard`s, the tutoring exit link (`completeOnboarding({exit:"personal"})` → `/personal`), and the forced-access gate for signed-out/unverified visitors.

- 9746c33: F-ID-03 Workspaces, Part 4: workspace switcher and the `(school)` shell layout gate.

  - `packages/domain/src/workspace/shellGate.ts`: `resolveShellGate(shell, {workspaceType, role})`, a pure function deciding `allow`/`redirect`/`forbidden` for the `school`/`personal`/`family` shells by reusing `resolveLandingRoute`. Closes the M0 wrap-up review's known issue (PR #17): `(school)/app/layout.tsx` had no check that a resolved membership actually belongs to `/app`, so a `parent` role or a `personal` workspace would render a curated nav tree pointing at routes that did not exist.
  - `apps/web/app/(school)/app/layout.tsx`: calls the gate right after `requireWorkspace()`; redirects a `parent` to `/family`, a `personal` workspace to `/personal`.
  - `apps/web/app/(personal)/personal/` and `apps/web/app/(family)/family/`: minimal shells — the same gate, a top bar, and one placeholder page each. No nav wired yet; F-ID-06/F-AC-10 build the real screens.
  - `apps/web/app/(shared)/workspace/workspace-switcher.tsx`: the top-bar `WorkspaceSwitcher` chip + sheet, wired into all three shells, calling the existing `switchWorkspace`/`listMyWorkspaces` server actions.

### Patch Changes

- Updated dependencies [48488b0]
- Updated dependencies [98e5a8e]
- Updated dependencies [3ccaf44]
  - @acadigma/contracts@0.2.0

## 0.1.0

### Minor Changes

- 5024296: F-ID-09 Parts 1-3 (audit viewer): the audit substrate — richer `audit_events` columns (actor_kind, subject_user_id, changed_fields, severity, hashed request IP), `app.audit_action_catalog` with the F-ID-09 §5.1 action catalogue and a CI parity check against its TypeScript mirror, a universal secret deny-list plus a free-text-nulling mechanism in the generic audit trigger, `audit_events_view` as the sole read surface, and correlation-id threading via a PostgREST pre-request hook — plus the owner-facing audit viewer at `/app/audit` (filterable list, detail sheet with a redacted diff, and the correlation/per-record history views).
- ecb6888: Production foundation: pnpm/Turbo monorepo, Supabase migrations 0001–0004 with RLS helpers and pgTAP suites, shared contracts/domain/db/ui packages, Next.js 15 app shell with Supabase SSR auth and PWA, 13-job CI.
- 411cefe: F-ID-01 Authentication, Parts 1-4: register + email verification, sign in/out, forgot/reset/change password. Adds `auth_throttle` and the `public.throttle_*`/`log_auth_event` RPCs (migration `20260917020000_identity_auth.sql`); `packages/domain/src/auth` (password policy, safe-return-to); `packages/contracts/src/identity/auth`; `AuthCard`/`PasswordField`/`CountdownButton`/`InlineAlert` in `packages/ui`; the `/login`, `/register`, `/verify`, `/forgot`, `/reset` and `/account/security` screens.
- 7e774ce: F-ID-03 Workspaces & Membership, Parts 1-3: tenancy hardening + `WorkspaceContext` resolution + permission matrix + nav engine.

  - Migration `20260917020300_tenancy_hardening.sql` (D-50): `public.switch_workspace`/`public.list_my_workspaces`/`public.log_tenancy_context_rejected` RPCs, and `app.attach_freeze_workspace('public.school_profiles')` closing a real tenant-reparenting gap (the table's `workspace_id` PK was UPDATE-able).
  - `supabase/tests/09_tenancy.sql`: the four Base44 security-review attack paths (self-role escalation, cross-tenant read/write, membership self-insert-as-owner, removed-member access) re-proven with zero-rows-affected assertions.
  - `packages/db/src/workspace-context.ts`: full F-ID-03 §4.3 resolution order (header → `profiles.last_active_workspace_id` → first active membership, personal first), typed failure reasons, and the `tenancy.context_rejected` audit tripwire on a forged header.
  - `packages/domain/src/permissions.ts`: extended to the full F-ID-03 §2 tenancy/membership action list, with an exhaustive transcribed-table test.
  - `packages/domain/src/nav/`: typed nav config per workspace type × role (DESIGN-SYSTEM §3.2) and the pure `filterNav`/`isRouteVisible` functions.
  - `packages/domain/src/workspace/resolveLanding.ts`: `resolveLandingRoute` (F-ID-03 §4.4), replacing F-ID-01's `/onboarding`-only stub.
  - `apps/web/lib/workspace.ts` `requireWorkspace()` (unchanged contract, now backed by the hardened resolver) + `apps/web/app/(shared)/workspace/actions.ts` (`switchWorkspace`, `listMyWorkspaces`); `packages/contracts/src/identity/workspace.ts`.
  - `apps/web/app/(school)/app/page.tsx`: redirects the school shell root to `/app/dashboard` (needed for `resolveLandingRoute`'s `/app` destination to actually resolve).

- f1d28cb: M0 cross-feature gates: F-OP-07 school settings `resolve()` with the shipped defaults for the five `school_profiles` policy blobs, a read/patch repository and `updateSchoolSettings`/`getSchoolSettings` server action; F-ID-07 v1 notification event catalogue (54 events), its contracts mirror, and a CI parity test keeping catalogue, code and translated strings in sync.
- df07612: `packages/ui` primitives brought into conformance with DESIGN-SYSTEM.md §3–§7: nav-config-driven `BottomNav` (role/plan/owner-visibility filtering, a "More" sheet), token-only `StatusChip`/`MoneyText` (Indian grouping, Bengali numerals, lakh/crore compact), `DataList` rows-not-cards with cursor pagination and fixed-row virtualisation, a dirty-close guard on `FormSheet`, safe-area padding on `TopBar`/`BottomNav`, and the four missing custom primitives (`AttendanceToggle`, `MarkCell`, `PeriodGrid`, `BnEnText`). OpenTelemetry via `@vercel/otel` in `apps/web/instrumentation.ts` plus a `workspace_id`/`correlation_id` span-attribute helper (D-30). `redactForAI()` in `packages/domain/src/ai/redact.ts` — the allow-listed, fail-closed projection required before any Anthropic call (D-34) — with a Semgrep rule and an eslint import restriction enforcing D-26(5).
- 53a8393: M0 wrap-up (DECISION-LOG D-56): the two nav systems (`packages/domain/src/nav` and `packages/ui/src/primitives/nav-config.ts`) are unified on domain's curated DESIGN-SYSTEM §3.2 trees as the single source of `NavItem`/`NavConfig` types and data; `packages/ui` adds only the icon map and the seller/platform trees domain deliberately does not model. New `packages/domain/src/nav/entitlements.ts` maps the nav's per-screen module keys onto the plans engine's per-bundle `plan_modules`. The school shell (`apps/web/app/(school)/app`) now picks its curated tree from `WorkspaceContext.role` server-side, computes entitled modules from the plans engine, and renders `BottomNavFromConfig` on phone and the new `SidebarFromConfig` on desktop — replacing the old hand-rolled `SCHOOL_NAV`/`SchoolSidebar` that read neither nav engine.
- d6e1696: F-CM-06 Plans & Subscriptions, Parts 1-3: the reusable plans/limits engine. Adds
  `packages/domain/src/plans` (pure `assertWithinLimit`, `hasModule`, trial and
  proration math), `packages/db/src/repositories/{plans,subscriptions,usage}` (including
  the `requireWritable` PLAN_READ_ONLY guard, D-29), and `packages/contracts/src/plans`
  Zod schemas. Migration `20260917020100_plans_limits_engine.sql` adds a
  `platform_settings` table (AI top-up placeholders, D-39), seeds the `fees` module on
  Starter+ (D-31), adds `app.workspace_plan`/`app.within_limit`, and closes a permission
  gap in `app.set_access_mode` (previously callable by any authenticated user).

### Patch Changes

- 79c6671: Bump `vitest` (and its transitive `@vitest/mocker`) from 3.2.7 to 4.1.11 across every workspace to close GHSA-82fw-gwwq-j7x9 (path traversal / arbitrary file read via `@vitest/mocker`'s redirect mock), a dev-only dependency (Dependabot alerts #1–7, all moderate). 4.1.11 was published 2026-08-18, clearing D-49's 2-day release-age cooldown without an exclude entry.

  Vitest 4 removed the separate `vitest.workspace.ts` file; the five test projects (`domain`, `contracts`, `db`, `web`, `ui`) now live under `test.projects` in `vitest.config.ts`. `packages/ui` gained `@types/node` and `"node"` in its `tsconfig.json` `types` array, restoring the `process.env.NODE_ENV` typing in `src/motion/gsap.ts` that vitest 3's type chain had been pulling in incidentally. No runtime behaviour change; `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm --filter @acadigma/web build` are green.

- Updated dependencies [5024296]
- Updated dependencies [79c6671]
- Updated dependencies [ecb6888]
- Updated dependencies [411cefe]
- Updated dependencies [7e774ce]
- Updated dependencies [f1d28cb]
- Updated dependencies [d6e1696]
  - @acadigma/contracts@0.1.0
