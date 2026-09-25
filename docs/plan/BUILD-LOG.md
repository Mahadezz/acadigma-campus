# Acadigma Campus — Build Log

A dated, newest-first record of what merged to `main`, what it shipped, which decisions it carries, which migrations went live and how the smoke test went. The lead appends one entry here after every merge (`docs/plan/LANES.md` "How a Part moves", step 6). Seeded from `git log origin/main --first-parent` and `gh pr list --state merged` for everything from M0 through 2026-09-25. Order is true merge order (`git log --first-parent`/`mergedAt`), newest first — not commit-message date.

---

## 2026-09-25 — PR #63 — feat(operations): F-OP-03 Part 3 — report card template on the PDF engine (D-206)

- **Lane:** operations
- **Shipped:** `report_kind` gains `'report_card'`; `ReportCardDto`/`ReportCardParams` in `packages/contracts` (academic data only, no branding or grade-band logic); one A4, bilingual `ReportCardDocument` template (subject table, totals, incomplete-marks banner, attendance summary, signatures); grade letters/GPA reused from #46/D-302, never re-derived. Marks entry (F-AC-06) is still on the billing lane's branch, so the render source is a 40-student fixture behind one seam function (`getReportCardData`) that already takes real `studentId`/`examId` — only that function's body changes once marks entry lands. New `report.render.report_card` permission (owner/admin/teacher). Also carries #62's PDF font fix, already merged to main.
- **Decisions:** D-206.
- **Migrations:** `20260925300313_report_card_kind.sql` (renamed once, from `...300312`, after main's newest migration moved past it) — applied to production; db workflow run 36198352726 succeeded.
- **Review/incidents:** pgTAP `42_report_card_kind.sql` (6 assertions) was CI-pending, not run locally (no Docker that session). The fixture never serves in production — the seam returns `not_found` and `/app/reports` hides the button — so a fixture student can never print under a real school's letterhead. Deferred: Playwright journey (same scope cut as Parts 1-2).

## 2026-09-25 — PR #67 — fix(operations): danda in Hind Siliguri + PDF stream integrity test

- **Lane:** lead (production hotfix — one of the two bugs a QA pass caught, see D-72)
- **Shipped:** Cleared main of suspected PDF renderer corruption: the bad sample files on disk turned out to be a UTF-8/latin1 round trip done outside the render path, not a real bug — reproduced and ruled out byte-for-byte. Fixed the actual defect found along the way: the danda (U+0964/U+0965) sits in Unicode's Devanagari block, so the script-splitter routed it into the Inter run, which has no glyph for it, drawing a tofu box; it now routes to Hind Siliguri. Added a permanent regression test that inflates every PDF stream with `node:zlib` and asserts the Bengali text and danda are really there.
- **Decisions:** none (PR states no decision entry was needed).
- **Migrations:** none.
- **Review/incidents:** root cause was mistaken renderer-corruption reports against stale/mishandled sample files, not the renderer; the real, smaller bug (danda glyph) is fixed and now has a standing test so it can't silently regress.

## 2026-09-25 — PR #65 — chore(release): version packages

- **Lane:** lead
- **Shipped:** Changesets "version packages" release PR, merged — bumps package versions and `CHANGELOG`s for the changesets accumulated up to and including PR #61 (marks entry D-304, attendance follow-ups D-105, the classes-embed hotfix).
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #60 — feat(academics): F-AC-06 Part 3 — marks entry and the publish completeness gate

- **Lane:** billing
- **Shipped:** `marks` table and `public.save_marks` as the only writer (the paper's teacher, the section's class teacher, or an owner/admin; only while the exam is in marks entry and the paper isn't locked; idempotent; a per-row version check and range check so one bad row never blocks the rest); `exam_subjects.teacher_id`; `app.tg_exams_publish_gate` refuses publish until every enrolled student in every paper has a mark or is marked absent/exempt. `/app/marks/[examSubjectId]` is the phone-first entry screen (72 px rows, big numeric input, Enter to the next student, Absent/Exempt chips, sticky "24/40 · Save"; ↑/↓, Esc, A, E, Ctrl+S on desktop). Exam papers get a subject-teacher picker and an "n/m marked" count.
- **Decisions:** D-304 (confirms D-302's rounding stands — 2 decimals, no rounding before banding — and records the offline per-cell rule, "later edit wins," for when the outbox is built).
- **Migrations:** `20260925300312_marks.sql` — applied to production; db workflow run 36195106470 succeeded.
- **Review/incidents:** review fixed a modifier-key conflict (Ctrl/Cmd/Alt+A or +E now keep their browser meaning; only a bare A or E marks Absent/Exempt), made a dropped connection during Save keep every typed mark and its idempotency key so a retry replays safely, made a `CONFLICT` row adopt the server's value and version while keeping what was typed (Save again keeps mine, Esc takes theirs), clarified the Absent/Exempt chip labelling, and collapsed marks-entry auditing to one paper-level `marks.entered` event per save instead of one per student. Declined: splitting the two new `exam_subjects` foreign keys into `NOT VALID` + `VALIDATE` (the migration is one transaction and the table is tiny). Deferred: the entry-date window, submit/lock/unlock with reasons, the progress screen, the offline queue and autosave, paste-a-column and the distribution histogram, `withheld`, remarks, a teacher's "my papers" list.

## 2026-09-25 — PR #62 — fix(operations): externalize @react-pdf/renderer/pdfkit so #standard-fonts resolves in prod

- **Lane:** lead (production hotfix — the second of the two bugs a QA pass caught, see D-72)
- **Shipped:** Fixed every PDF download 500ing in production: pdfkit resolves its bundled standard fonts through `createRequire(import.meta.url)`, and webpack was inlining pdfkit into the Next.js server bundle, baking in the *build machine's* absolute path — the same failure class D-204 had already fixed for the embedded Bengali fonts, this time inside pdfkit's own code. Fixed by marking `@react-pdf/renderer`, `pdfkit` and `fontkit` as `serverExternalPackages` (so they're `require()`'d for real at runtime) plus pinning them as direct `apps/web` dependencies (pnpm's isolated `node_modules` doesn't otherwise expose them there) and adding `outputFileTracingIncludes` so Vercel's file tracer picks up pdfkit's standard-fonts files, which its dynamic `require('#standard-fonts/...')` calls don't trace on their own.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** verified by inspecting the compiled output directly — before the fix, the built route had pdfkit's source inlined with a baked-in local file path; after, it externally imports the package and `route.js.nft.json` lists all 30 standard-fonts files.

## 2026-09-25 — PR #61 — fix(academics): disambiguate profiles embed through workspace_members

- **Lane:** lead (production hotfix — one of the two bugs a QA pass caught, see D-72)
- **Shipped:** Fixed `/app/classes` showing a generic error for every real user: `workspace_members` has four foreign keys to `profiles` (`user_id`, `invited_by`, `removed_by`, `created_by`), so PostgREST rejected the un-hinted `profiles(full_name)` embeds in `getClassesOverview` and `listClassTeacherOptions` as ambiguous (`PGRST201`). Disambiguated both embeds by naming the exact foreign key. Grepped the repo for any other embed through the same table; these were the only two.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** root cause recorded in the F-AC-01 spec: the unit-test suite mocks the Supabase client, so it never exercises real PostgREST relationship resolution, and the one e2e journey that opens `/app/classes` as an owner is skip-gated on `E2E_LIVE_SUPABASE` + OQ-27, which CI never sets — a gap this PR closes with an opt-in integration test against a real local PostgREST (`DB_LOCAL_SUPABASE=1`), verified to fail before the fix and pass after. This gap is the reason D-72 puts a real-PostgREST CI job on the lead queue.

## 2026-09-25 — PR #58 — feat(academics): F-AC-03 follow-ups — any teacher marks any section (D-105)

- **Lane:** identity
- **Shipped:** Any active owner/admin/teacher may now view and save any section's roll call, so a substitute can cover a class (`save_attendance`'s role guard is the whole rule; the old class-teacher-only check and `app.can_mark_attendance` are removed — edit window, future-date, school-day, class-list, idempotency, `CONFLICT` and read-only guards are unchanged). "Enrolled on that date" now follows `enrolled_on`/`ended_on`, not the enrolment's current status, so a later transfer can't erase an earlier day's register. UI: Today offers "Take attendance" on every class to anyone with `attendance.write`; a successful save no longer re-stamps "Mark all present".
- **Decisions:** D-105.
- **Migrations:** `20260925300311_attendance_any_teacher.sql` — applied to production; db workflow run 36192946464 succeeded.
- **Review/incidents:** none noted beyond the fixes already described above. Local gate: 127 test files / 1254 tests, all check scripts, web build, full pgTAP — all green.

## 2026-09-25 — PR #59 — docs(specs): F-ID-10 basic mode + F-ID-11 offline (D-403, D-71)

- **Lane:** lead
- **Shipped:** Docs-only. Two new feature specs from the owner's 2026-09-26 answers: F-ID-10 Basic mode (per-user synced `ui_mode`, class-by-class home, 56 px targets, text sizes, plain confirmations, undo — 4 Parts) and F-ID-11 Offline (read cache + one IndexedDB outbox replaying the same server actions, everything except generating/sending, attendance conflict sheet, marks per-cell "later edit wins," session-expiry and revocation purge — 5 Parts, platform-wide). Also: identity README rows, docs/README listing, a new `Offline` row in `_TEMPLATE.md`, absorption notes on F-AC-03 Part 7 / F-AC-06 Part 4, a ROADMAP note.
- **Decisions:** D-403, D-71.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #52 — chore(release): version packages

- **Lane:** lead
- **Shipped:** Changesets "version packages" release PR, merged — bumps package versions and `CHANGELOG`s for the changesets accumulated up to and including PR #53 (F-AC-03 attendance D-104, F-AC-01 classes/sections D-102, F-AC-06 Part 2 exams D-303, F-AC-02 students/guardians D-103, Bengali app-shell coverage, F-OP-03 Parts 1-2 PDF pipeline).
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #53 — feat(operations): F-OP-03 Parts 1-2 — PDF foundation + report run pipeline

- **Lane:** operations
- **Shipped:** `@acadigma/pdf`, a new package: a `@react-pdf/renderer` document shell (letterhead, footer with real page numbers, watermark, signature block), Inter + Hind Siliguri embedded as base64 `data:` URLs, locale-aware number/date formatting, a golden test proving Bengali conjuncts and two schools' letterheads render from real PDF bytes. Then the run pipeline: `report_runs`/`report_run_items` (migration + RLS + pgTAP), `createReportRun` (parse → context → `can()` → plan entitlement → `requireWritable` → repository → render) and `GET /api/pdf/[runId]`, both with auth tests. `report_kind` ships with one value, `'sample'` — the pipeline's own proof, since no real report kind exists yet. Minimal `/app/reports` pages behind the existing `reports` plan-module entitlement.
- **Decisions:** D-204 (library and font choice, no build-time font-subsetting toolchain), D-205 (one `report_kind` value this Part; synchronous in-request rendering instead of a cron drainer; no Storage row created yet).
- **Migrations:** `20260925300310_report_runs.sql` (renamed twice during review as main's newest migration moved) — applied to production; db workflow run 36140876654 succeeded.
- **Review/incidents:** lead review caught two blocking bugs before merge — fonts resolved via `import.meta.url` baked a build-machine absolute path into the Vercel bundle, so every render would 500 in production (fixed by embedding fonts as base64 `data:` URLs, no file read at all); and a Bengali school-name monogram rendered as mojibake because it went through a plain `Text` node instead of the existing `ScriptText` helper. Also fixed in review: `report_run_items.workspace_id` widened to a composite FK tied to its parent run's workspace (a row could otherwise carry a mismatched `workspace_id`), and hardcoded English strings in the document shell translated to follow the document's locale.

## 2026-09-25 — PR #55 — feat(academics): F-AC-03 demo cut — daily roll call and today view

- **Lane:** identity
- **Shipped:** `attendance_sessions` and `attendance_records` (one writer, `public.save_attendance`: class teacher or owner/admin, teacher only inside the edit window, admin beyond it; no future date; non-school day refused unless confirmed; exactly the enrolled students, each explicitly marked; idempotent; a re-save must name the loaded version or is refused as a `CONFLICT`). `/app/attendance` (Today overview, every class marked/not marked, who marked it, the school's rate) → `/app/attendance/[sectionId]` (one-thumb roll call: "Mark all present" with Undo, then flip absentees). The dashboard's attendance slot shows the same rate.
- **Decisions:** D-104.
- **Migrations:** `20260925300309_attendance.sql` — applied to production; db workflow run 36139669162 succeeded.
- **Review/incidents:** none noted. Deferred (spec status, D-104): offline queue and conflict sheet, locking/correction requests, register and rollup, alerts, reminders and guardian notifications, copy-yesterday, notes, period mode, policy screen, parent view.

## 2026-09-25 — PR #51 — feat(design): Bengali covers the signed-in app shell (D-401)

- **Lane:** design
- **Shipped:** `<html lang>` follows the locale; one resolver (cookie → `profiles.locale` → en, cached per request); language switch and **sign-out** in a new user menu; 404/error/forbidden pages translated; Western digits in Bengali enforced by a guard test; en/bn key-parity test.
- **Decisions:** D-401.
- **Migrations:** none.
- **Review/incidents:** review caught an uncached locale lookup (3+ DB round trips per page) and the missing sign-out; README test-report table deduplicated.

## 2026-09-25 — PR #54 — feat(academics): F-AC-02 students and guardians — demo cut

- **Lane:** identity
- **Shipped:** `students`, `student_private_details` (date of birth), `guardians`, `enrollments`, the `student_roster` view and `public.admit_student` (idempotent; roll numbers unique per section; one active enrolment per year); `/app/students` search (English/Bangla/ID) and profile; demo seed script for Class 6-ক (not run on production).
- **Decisions:** D-103 (sensitive fields split, like D-63).
- **Migrations:** `20260925300306_students_and_guardians.sql` — applied to production; smoke test passed.
- **Review/incidents:** security review caught date of birth being written unmasked into the audit trail (readable by platform staff) — redacted before merge; class-teacher access limited to the current academic year.

## 2026-09-25 — PR #48 — feat(academics): F-AC-06 Part 2 — exams, demo cut

- **Lane:** billing
- **Shipped:** `exams`, `exam_sections`, `exam_subjects`, `public.create_exam`; each exam freezes its grading rules at creation; §5.12 status chain in DB and domain; papers lock from marks entry on; `/app/exams` list and detail.
- **Decisions:** D-303.
- **Migrations:** `20260925300305_exams.sql` — applied to production; smoke test passed.
- **Review/incidents:** exam year was changeable after creation; pass marks were rounded against D-302; the snapshot trigger leaked a school's grade-scale state to strangers — all fixed before merge. Publish still needs a marks-completeness gate (Part 4).

## 2026-09-25 — PR #47 — feat(academics): F-AC-01 — classes, sections, subjects (demo cut)

- **Lane:** identity
- **Shipped:** `sections` and `subjects` (archive-only), class-teacher eligibility, a trigger that clears a removed or demoted class teacher, NCTB starter subjects (Bangla/English 1st and 2nd papers, four religion subjects), `/app/classes`.
- **Decisions:** D-102.
- **Migrations:** `20260925300304_sections_and_subjects.sql` — applied to production; smoke test passed.
- **Review/incidents:** removed teachers stayed as class teachers until the orphaning trigger was added.

## 2026-09-25 — PR #45 — fix(auth): throttle keys derived server-side; login rate-limit copy

- **Lane:** identity
- **Shipped:** per-user throttle keys derived from `auth.uid()` so nobody can lock another user out; clients can't reset their own limits; an expired block starts a fresh window; the login rate-limit message shows once, in minutes.
- **Decisions:** D-101 (email-lockout trade-off recorded).
- **Migrations:** `20260925300303_throttle_per_user_keys.sql` — applied to production; smoke test passed.
- **Review/incidents:** first version let a signed-in user reset their own limits (undoing the createSchool limit) — fixed and re-verified.

## 2026-09-25 — PR #49 — feat(design): readable audit trail

- **Lane:** design
- **Shipped:** audit rows read as bilingual sentences; no raw table names, codes or empty "()"; a test renders every catalogued action in both languages.
- **Decisions:** D-402.
- **Migrations:** none.
- **Review/incidents:** none (role-change sentences still render before/after blank — follow-up).

## 2026-09-25 — PR #46 — feat(academics): F-AC-06 Part 1 — grade scales

- **Lane:** billing
- **Shipped:** `grade_scales`/`grade_bands` with a database coverage check (0–100, no gaps), Bangladesh default, SQL/TypeScript grading parity, `/app/settings/grade-scale`.
- **Decisions:** D-302 (no rounding before banding; owner to confirm the 32.5% case).
- **Migrations:** `20260925300302_grade_scales.sql` — applied to production; smoke test passed.
- **Review/incidents:** an empty band set was accepted; bands were writable around the save function's lock — both closed.

## 2026-09-25 — PR #41 — feat(design): owner/admin today dashboard from real data (D-400)

- **Lane:** design
- **Shipped:** `/app/dashboard` replaces the developer placeholder: letterhead name, plan/trial/read-only chip, members by role, staff-directory count, a five-step setup checklist (academic year + classes counted from #37's tables), owner-only recent activity as curated sentences, honest empty slots for attendance and results; lighter teacher view; en/bn. `apps/web/lib/implemented-routes.ts` hides nav links to unbuilt routes (the live bug hunt found 14 prefetch 404s per page).
- **Decisions:** D-400.
- **Migrations:** none.
- **Review/incidents:** the academic-year step was hard-coded "not done"; the activity feed showed raw table names — both fixed before merge.

## 2026-09-25 — PR #43 — feat(academics): F-AC-11 Part 1 — holidays, overrides, `app.is_school_day`

- **Lane:** operations
- **Shipped:** `holidays` and `working_day_overrides` (staff read, owner/admin write, audited, read-only guarded, `created_by` immutable); `app.is_school_day`, `app.school_days`, `app.school_day_count` (override → weekly pattern → holiday); holidays screen at `/app/settings/calendar`, en/bn.
- **Decisions:** D-202, D-203 (the functions run as definer behind `app.can_read_school_calendar`, so parents get the right answer and strangers get nothing).
- **Migrations:** `20260925300301_school_calendar.sql` — applied to production; smoke test passed.
- **Review/incidents:** first version gave parents the wrong answer (they can't read holidays under invoker rights); fixed before merge.

## 2026-09-25 — PR #42 — fix(billing): read-only join check in join functions; seed passwords hashed at seed time (D-301)

- **Lane:** billing
- **Shipped:** joining a read-only school is refused inside `accept_invitation` / `join_workspace_by_code` after the token or code is verified; the trigger's non-member branch is gone, so strangers can't learn a school's access mode; seed passwords hashed with `crypt()` at seed time (no hashes in the repo).
- **Decisions:** D-301.
- **Migrations:** `20260925300201_readonly_join_check.sql` — applied to production; smoke test passed.
- **Review/incidents:** the new pgTAP exposed that the seed had been broken on main since #32 (duplicate labels); fixed.

## 2026-09-25 — PR #37 — feat(identity): F-ID-05 Part 4 — create-school wizard steps 3-4 + `public.create_school_workspace`

- **Lane:** identity
- **Shipped:** wizard steps 3 (classes) and 4 (review and create), en/bn; `grade_levels` and `academic_years` tables (T2 RLS, audit catalogue rows, read-only guard); `public.create_school_workspace(jsonb)` — one transaction, idempotent by client key, EIIN uniqueness via the D-66 index, 3 schools per user per day, `createSchool` throttle bucket, named errors; the function is now the only way to create a workspace (direct INSERT revoked). EIIN is set once at creation; the settings form shows it read-only. Fixed on the way: 360px school-type toggle overlap, working days lost on reload.
- **Decisions:** D-100 (4-step wizard, logo step waits for file uploads, custom-only class names pending OQ-2, throttle lockout follow-up queued for the lead).
- **Migrations:** `20260925300101_create_school_workspace.sql` — applied to production; smoke test passed.
- **Review/incidents:** three review rounds (Fable lead, security ×2, database): closed the direct-insert bypass of the daily limit, the EIIN existence oracle via failed create attempts, `created_by` forgery, a missing index on the per-day count, and the audit-catalogue gap; the EIIN guard clashed with #39's settings form (made read-only).

## 2026-09-25 — PR #38 — chore(lead): parallel lanes (D-69) and CI/Vercel usage cuts (D-70)

- **Lane:** lead
- **Shipped:** `docs/plan/LANES.md`, `BUILDER-BRIEF.md`, this build log; `ci.yml` `changes` job that skips the heavy jobs only for pure-docs changes (fails closed); `scripts/check-migrations-order.mjs`; Vercel builds `main` only (`ignoreCommand`); CI.md/HANDBOOK fixes (types download, re-date procedure).
- **Decisions:** D-69, D-70. Migration timestamps are real UTC time (the lane-digit format was withdrawn the same day).
- **Migrations:** none.
- **Review/incidents:** first version of the skip logic failed open (renames, SIGPIPE, allowlists, `needs` on skipped jobs); rewritten and re-verified by security before merge. Main has no branch protection — owner action.

## 2026-09-25 — PR #39 — feat(ops): F-OP-07 Part 1 remainder — settings shell, school profile, branding

- **Lane:** operations
- **Shipped:** `/app/settings` (grouped rows, search), `/overview` (read-only "how this school works" for every member), `/school` (profile form, changed-fields patch, optimistic concurrency with reload-on-conflict, owner-only recent changes), `/branding` (header lines with whitelisted `{token}`s and a live preview). Part 2 (academic settings) waits for #37's tables.
- **Decisions:** D-200 (deferrals: logo upload, public view, F-OP-03 preview), D-201 (`/app/settings/school` owns the profile fields; F-ID-03 Part 8 narrows to lifecycle).
- **Migrations:** none.
- **Review/incidents:** history list was always empty (audit table name mismatch) — fixed; `javascript:` websites refused; version must be a timestamp; concurrency proven only against the in-memory fake (noted in the test report).

## 2026-09-25 — PR #35 — feat(billing): read-only mode refuses every write — server actions + database (D-300)

- **Lane:** billing
- **Shipped:** `requireWritable` on every tenant write server action, plus a shared `app.tg_require_writable()` trigger on every tenant table as defence in depth; `scripts/check-require-writable.mjs` and `supabase/tests/50_require_writable.sql` enforce it in CI. Supersedes D-62's "allow everything else" — read-only now refuses every write, not just creates.
- **Decisions:** D-300.
- **Migrations:** `20260925300100_require_writable_guard.sql` — applied to production; smoke test passed.
- **Review/incidents:** review follow-ups (same PR): removing access (membership → `removed`, capability revoke, invitation revoke/decline) stays possible in read-only while siblings (role change, grant, invitation edit) are refused.

## 2026-09-25 — PR #36 — feat(design): D-68 visual refinement (Blend) + Acadigma product logos

- **Lane:** design
- **Shipped:** "Blend" visual refinement (6px radius, hairline rings instead of drop shadows, lighter/tighter headings, 16px body, an `eyebrow` utility) on top of D-57's ink/paper palette; real Acadigma/Campus grid-mark logos and app icons replace the placeholder text/icon.
- **Decisions:** D-68.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #32 — feat(ops): F-OP-06 Part 1 — staff schema, RLS and the compensation split

- **Lane:** operations
- **Shipped:** Staff schema (roles, employment status, the fixed/hourly compensation split) with its RLS policies.
- **Decisions:** D-63.
- **Migrations:** `20260925000900` — applied to production; smoke test passed.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #33 — chore(release): version packages

- **Lane:** lead
- **Shipped:** Changesets "version packages" release PR, merged — bumps package versions and `CHANGELOG`s for the changesets accumulated up to and including PR #34.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #34 — feat(identity): F-ID-05 Part 3 — create-school wizard, steps 1-2

- **Lane:** identity
- **Shipped:** The create-school onboarding wizard's first two steps (school profile, EIIN lookup/availability).
- **Decisions:** D-66, D-67.
- **Migrations:** `20260925000700_school_eiin_availability.sql`, `20260925000800_throttle_eiin_check_bucket.sql` — applied to production; smoke test passed.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #31 — feat(commerce): F-CM-06 Part 4 — trial expiry job puts a workspace into read-only mode

- **Lane:** billing
- **Shipped:** `expire_pro_trials()` moves an expired-trial workspace to `access_mode = read_only` instead of a Free plan (D-42 retired the Free plan row).
- **Decisions:** D-62.
- **Migrations:** `20260925000500_trial_expiry_billing_tick.sql` — applied to production; smoke test passed.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #30 — feat(identity): F-ID-03 Part 4 — workspace switcher, shell layout gate, minimal personal/family shells

- **Lane:** identity
- **Shipped:** `resolveShellGate()` closes the M0 gap where a parent/personal context could render the wrong shell's nav tree; `WorkspaceSwitcher` reuses `FormSheet` instead of a bespoke desktop dropdown.
- **Decisions:** D-61.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #24 — feat(identity): F-ID-05 Part 2 — onboarding shell and chooser

- **Lane:** identity
- **Shipped:** Onboarding shell and path chooser; `onboarding_progress` repository keyed on `userId` rather than `WorkspaceContext` (no context exists yet at this stage).
- **Decisions:** D-60.
- **Migrations:** `20260925000300_onboarding_progress.sql` — applied to production. Merged after PR #29 the same day, so the anonymous-RPC smoke test (added by #29) already existed for this deploy and passed.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #29 — fix(db): hotfix — pre-request hook broke every anonymous API call (D-65)

- **Lane:** lead
- **Shipped:** `public.pre_request()` SECURITY DEFINER wrapper so `anon` can reach the PostgREST pre-request hook without USAGE on schema `app`. `db.yml`'s push job gained the anonymous-RPC smoke test as part of this fix.
- **Decisions:** D-65.
- **Migrations:** `20260925000250_pre_request_public_wrapper.sql` — applied to production; first deploy to carry the new smoke test, passed.
- **Review/incidents:** **Incident.** The audit-substrate migration (PR #6) had set `pgrst.db_pre_request = app.pre_request`, and `anon` has no USAGE on schema `app` (D-50) — every anonymous request (sign in, register, reset password) failed with `42501` on the live site from the moment that migration deployed. CI could not catch it (no PostgREST in CI's Postgres). Found manually on 2026-09-24 by signing in to campus.acadigma.com with the demo account; fixed same day.

## 2026-09-24 — PR #28 — docs(decisions): D-64 — infrastructure decisions taken with the owner on 2026-09-24

- **Lane:** lead
- **Shipped:** Recorded the owner's infrastructure decisions: repo made public, public-repo protections enabled, Actions may open/approve PRs, Vercel functions pinned to `bom1`, demo account noted, `campus.acadigma.com` as the future domain.
- **Decisions:** D-64.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #27 — chore(release): version packages

- **Lane:** lead
- **Shipped:** Changesets "version packages" release PR, merged.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #26 — ci(release): rename createGithubReleases to create-github-releases (changesets/action v2)

- **Lane:** lead
- **Shipped:** Fixed `release.yml`'s changesets action input name for the v2 action, unblocking the release PR (had failed on this since M0).
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #5 — ci(deps): bump the actions group across 1 directory with 10 updates

- **Lane:** lead
- **Shipped:** Dependabot group bump of pinned GitHub Actions SHAs.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #25 — chore(web): pin Vercel functions to bom1 (Mumbai), next to the database

- **Lane:** lead
- **Shipped:** `apps/web/vercel.json` region pinned to `bom1`, alongside the `ap-south-1` database (production had been running in `iad1`). Completes COMPLIANCE-PDPA's function-region requirement.
- **Decisions:** none (folded into D-64 item 4).
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #23 — fix(db): workspace billing bootstrap no longer trips the tenant guard (D-59)

- **Lane:** billing
- **Shipped:** Split `app.tg_workspace_billing_bootstrap()` into a BEFORE INSERT `app.tg_workspace_billing_defaults()` (sets `plan_id`/`trial_ends_at` directly, no nested UPDATE) plus a narrower AFTER INSERT step for `subscriptions`, so the bootstrap no longer trips `app.tg_workspaces_guard()`'s `authenticated`-role check. Hardened on review: a client-supplied `plan_id`/`trial_ends_at` is now always overwritten, and a missing plan-catalogue row aborts the transaction instead of silently under-entitling.
- **Decisions:** D-59.
- **Migrations:** `20260925000200_billing_bootstrap_vs_workspace_guard.sql` — applied to production before the smoke-test step existed; no smoke-test record for this deploy.
- **Review/incidents:** hardening added on Opus review before merge (see D-59 consequences).

## 2026-09-24 — PR #19 — feat(identity): F-ID-05 Part 1 — personal workspace at registration

- **Lane:** identity
- **Shipped:** Registration creates a personal workspace for every new user; audited via the existing generic `workspaces.insert` row rather than a curated `workspace.created` action.
- **Decisions:** D-58.
- **Migrations:** `20260925000100_personal_workspace_uniqueness.sql` — applied to production before the smoke-test step existed; no smoke-test record for this deploy.
- **Review/incidents:** decision raised on Opus review (D-58) rather than left as an undiscussed spec deviation.

## 2026-09-24 — PR #22 — chore(deps): triage and fix Dependabot alerts

- **Lane:** lead
- **Shipped:** Triaged and resolved open Dependabot security alerts.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #20 — feat(ui): visual language from acadigma.com — ink/paper tokens, JetBrains Mono (D-57)

- **Lane:** design
- **Shipped:** Ink/paper token set and JetBrains Mono replace the prior palette across `packages/ui`; retired amber-as-decoration, kept semantic colour only.
- **Decisions:** D-57.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #18 — test(db): isolation + escalation tests for the 5 KNOWN_GAPS tables

- **Lane:** lead
- **Shipped:** pgTAP isolation and escalation coverage for the 5 tables `coverage.sql` had tracked as gaps since M0 wrap-up.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #21 — docs(roadmap): reconcile M1 Part numbers with the specs

- **Lane:** lead
- **Shipped:** Reconciled `ROADMAP.md`'s M1 order table against the feature specs' own §8 Part numbering (see ROADMAP.md "Changes (2026-09-24)" for the itemised fixes).
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #17 — feat(m0): wrap-up — one nav system wired into the school shell; RLS/grants invariants; coverage.sql

- **Lane:** lead
- **Shipped:** Unified the two nav systems onto the domain's curated trees; added `13_rls_grants_invariants.sql` (every table RLS-on, no anon USAGE on `app`) and `coverage.sql` + `scripts/check-coverage-test-files.mjs`. Closed M0.
- **Decisions:** D-56.
- **Migrations:** none.
- **Review/incidents:** review found the `(school)` shell layout-gate gap, carried into M1 1.1 / PR #30.

## 2026-09-24 — PR #16 — fix(tenancy): tripwire RPC refuses a caller with no auth.uid()

- **Lane:** identity
- **Shipped:** Tenancy tripwire RPC now refuses a caller with no `auth.uid()` instead of misclassifying it.
- **Decisions:** none.
- **Migrations:** `20260924040000_tripwire_requires_auth.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #9 — docs: 2026-09-24 handoff, rules learned, OQ-26 answered

- **Lane:** lead
- **Shipped:** `docs/plan/HANDOFF-2026-09-24.md` — current state, infrastructure, rules learned, owner actions, next steps.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #14 — fix(db): deny-by-default function EXECUTE; CI mirrors Supabase default privileges

- **Lane:** lead
- **Shipped:** Revoked Supabase's default function EXECUTE grants (D-54: deny by default, explicit `grant execute` per function); `db` job's CI bootstrap now mirrors the platform's default privileges so this class of bug is caught in CI, not production.
- **Decisions:** D-54.
- **Migrations:** `20260924030000_revoke_default_function_grants.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #12 — fix(tenancy): F-ID-03 review follow-ups — stale workspace cookie, removed-vs-forger tripwire, cascade freeze

- **Lane:** identity
- **Shipped:** Fixed three review follow-ups from the F-ID-03 tenancy PR: stale workspace cookie handling, distinguishing a removed member from a forged context, and a cascade-freeze exception.
- **Decisions:** D-52.
- **Migrations:** `20260924010000_tenancy_freeze_cascade_exception.sql`, `20260924020000_tenancy_tripwire_membership_status.sql` — applied to production.
- **Review/incidents:** follow-ups from F-ID-03's own review (PR #7).

## 2026-09-24 — PR #6 — feat(identity): F-ID-09 Parts 1-3 - audit substrate, catalogue, owner viewer

- **Lane:** lead
- **Shipped:** Append-only audit substrate, generic `app.tg_audit()` trigger, `app.log_audit_event()`, the audit action catalogue, and the owner's audit viewer.
- **Decisions:** D-51.
- **Migrations:** `20260924000100_audit_substrate.sql` — applied to production. This migration is the one that later broke anonymous sign-in (see PR #29's incident note).
- **Review/incidents:** the pre-request-hook permission gap that caused the D-65 incident originates in this migration; not caught here because CI has no PostgREST.

## 2026-09-24 — PR #15 — ci(db): check generated types against the PR's own migrations (D-55)

- **Lane:** lead
- **Shipped:** Moved `types.generated.ts` freshness checking into the `db` job, generated from the PR's own migrations applied to CI's Postgres rather than the live project.
- **Decisions:** D-55.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #13 — chore(supabase): move Campus to its own Supabase project (D-53)

- **Lane:** lead
- **Shipped:** Moved the Campus app onto its own Supabase project (`kekfmibwjejdhxjkmezo`), superseding the earlier shared-project decision (D-19).
- **Decisions:** D-53 (supersedes D-19).
- **Migrations:** none (project migration, not a schema migration).
- **Review/incidents:** none noted.

## 2026-09-24 — PR #11 — fix(ui): self-host Inter and Hind Siliguri via next/font (DESIGN-SYSTEM §1.6)

- **Lane:** design
- **Shipped:** Self-hosted Inter and Hind Siliguri via `next/font` instead of a runtime Google Fonts request.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #7 — F-ID-03 Workspaces & Membership, Parts 1-3: tenancy hardening, WorkspaceContext, permissions + nav

- **Lane:** identity
- **Shipped:** Tenancy tables, RLS template, `WorkspaceContext` resolution, permission matrix, nav engine — the highest-risk work in the repo, landed while the codebase was still small.
- **Decisions:** D-12 (further refined), D-50 (client-callable function grants).
- **Migrations:** `20260917020300_tenancy_hardening.sql` — applied to production.
- **Review/incidents:** produced the follow-ups fixed in PR #12.

## 2026-09-17 — PR #3 — feat(auth): F-ID-01 Authentication, Parts 1-4

- **Lane:** identity
- **Shipped:** Supabase Auth wiring, `profiles`, register + verify, sign in/out, password reset; established `withServiceRole`, middleware, generated types.
- **Decisions:** D-50.
- **Migrations:** `20260917020000_identity_auth.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #8 — M0 0.9: packages/ui primitives conformance, OpenTelemetry, redactForAI()

- **Lane:** design
- **Shipped:** `packages/ui` primitives (AppShell, TopBar, BottomNav, FormSheet, DataList, EmptyState, StatusChip, MoneyText) matched to `DESIGN-SYSTEM.md`; GSAP motion module (lazy-loaded, reduced-motion aware); OpenTelemetry wiring (`@vercel/otel`); `redactForAI()` moved up from M5 to land before any AI code path exists.
- **Decisions:** D-30, D-33 (implemented).
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #2 — feat(billing): plans/limits engine (F-CM-06 Parts 1-3)

- **Lane:** billing
- **Shipped:** Plans, subscriptions and trial; the limits engine (`assertWithinLimit`, `hasModule`, `access_mode`) every later area gates on.
- **Decisions:** D-39 (plan_prices/overage numbers).
- **Migrations:** `20260917020100_plans_limits_engine.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #4 — feat(settings,notifications): resolve() defaults + notification catalogue skeleton

- **Lane:** operations
- **Shipped:** `resolve()` settings with defaults (timezone Asia/Dhaka, working days, policies as jsonb); notification event catalogue skeleton with its CI parity test.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #1 — Foundation: monorepo, database substrate, app shell, CI (M0 0.1)

- **Lane:** lead
- **Shipped:** Monorepo scaffold, foundation migrations 0001-0004 (app schema helpers, identity, audit/files/counters/jobs, plans/notifications), pgTAP bootstrap suite and seed, CI pipeline, app shell skeleton.
- **Decisions:** D-01 through D-49 (the initial decision log; not itemised individually here — see `DECISION-LOG.md`).
- **Migrations:** `20260917010000_extensions_and_app_schema.sql`, `20260917010100_identity.sql`, `20260917010200_audit_and_files.sql`, `20260917010300_plans_and_notifications.sql` — applied to production.
- **Review/incidents:** none noted.
