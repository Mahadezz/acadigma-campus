# Test Report — F-AC-03 Student attendance, follow-ups (D-105)

|         |                                                                  |
| ------- | ---------------------------------------------------------------- |
| Feature | F-AC-03 — Student attendance                                     |
| Part    | Follow-ups to the demo cut: any teacher marks any section, §5.3  |
| Spec    | `docs/features/02-academics/F-AC-03-attendance.md` §2, §5.3, §11 |
| PR      | #58                                                              |
| Status  | **PASS WITH KNOWN ISSUES** (CI numbers in the PR checks)         |
| Date    | 2026-09-26                                                       |
| Run by  | Claude (identity lane builder)                                   |

## 1. Scope

A teacher covering an absent colleague's class can now take and save its roll call (owner decision 2026-09-26, D-105). Staff, parents, non-members and other schools' teachers still cannot. The class list for a date follows the enrolment's `enrolled_on`/`ended_on`, not its current status, so a transfer never rewrites past registers. Smaller fixes: a saved roll call no longer re-stamps "Mark all present" on the next save; student, class and teacher names render through `BnEnText`; the unused `sectionDayRate` and the `noOwnSections` string are gone; `save_attendance` uses a jsonb map instead of two temp tables; `attendance_day`'s enrolled count is scoped by `workspace_id`.

| #    | Criterion                                                  | Covered by                                                                                                       |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AC16 | (as amended by D-105) any teacher marks; other roles don't | `35_` substitute saves ক, class teacher saves খ; staff, parent, non-member, other school's teacher `FORBIDDEN`   |
| AC9  | The edit window still binds a teacher (the substitute)     | `35_` `OUTSIDE_EDIT_WINDOW` for the substitute at today − 5                                                      |
| §5.3 | Expected students by date, not current status              | `35_` transferred student (ended yesterday): not on today's register, on the day before's; Today counts 3 then 2 |
| —    | Bulk stamp not repeated after a save                       | `roll-call.test.tsx` second save sends `bulkMarked: false` with the new version                                  |

## 2. Environment

Local PostgreSQL 17.10 (embedded) + pgTAP 1.3.4 running the CI `db` job's steps (bootstrap, every migration, every test file); Node 24; pnpm 10.34.5. Branch `feat/identity-attendance-followups`, merged with `origin/main` at e144a47. Migration head `20260925300311_attendance_any_teacher.sql`.

## 3. Unit (Vitest)

`pnpm test`: **127 files, 1254 tests passed**; all files 90.2 % statements, 82.34 % branches. Changed: `attendance-today.test.tsx` (a teacher is offered "Take attendance" on another class; someone who cannot mark only gets "View"), `roll-call.test.tsx` (bulk flag cleared after a successful save), `db/repositories/attendance.test.ts` (the roll-call query no longer filters on enrolment status; `NOT_ASSIGNED` mapping removed), `domain/attendance/percentage.test.ts` (`sectionDayRate` cases removed with the function).

**The domain/SQL percentage parity is fixture-based:** `packages/domain` `attendancePercentage` and `app.attendance_pct` are checked against the same AC5 fixture (90.91, 86.36 with half day off, 0 with no records) in their own suites. No test runs the two implementations side by side on generated inputs, so a divergence outside those fixtures would not be caught.

## 4. Database (pgTAP)

Full local run: every file passes — `34_attendance.sql` **45/45** (the two `NOT_ASSIGNED` cases moved to the new rule), `35_attendance_any_teacher.sql` **13/13**, and all other files as on main. `51_readonly_join_and_seed.sql` uses psql meta-commands and does not run in the local harness (pre-existing; it runs in CI).

`35_` proves: a non-class-teacher teacher saves a section, and the session's `taken_by` and every record's `marked_by` name them; a class teacher saves another section; the edit window still binds them; staff, a parent member and a signed-in non-member get `FORBIDDEN`; another school's teacher gets `FORBIDDEN` here and `SECTION_NOT_FOUND` through their own school; a student whose enrolment was set to `transferred` with `ended_on` yesterday is not expected today (2) but is expected two days ago (3); `attendance_day` counts 3 yesterday and 2 today.

## 5. End to end

`apps/web/e2e/journeys/take-attendance.spec.ts` is unchanged (it opens whichever class offers "Take attendance" or "View") and stays skip-gated on OQ-27. **Not run live.** No new screenshots: the visible change is which button a teacher sees on other classes (covered by the component test) and `lang` spans on names.

## 6. Performance

`pnpm --filter @acadigma/web build` green. First-load JS: `/app/attendance` 234 kB gzipped (was 233), `/app/attendance/[sectionId]` 208 kB (budget 250 kB).

## 7. Known issues

1. A transfer that sets the enrolment's `status` but not `ended_on` would keep the student on the old section's register (D-105 consequence; the future transfer action in F-AC-02 must set `ended_on`). No such action exists today.
2. If two enrolments of one student in the same section overlap on a date, the database counts the student once but the roll-call screen would list them twice and the save would be refused as `VALIDATION`. Only possible with hand-edited data.
3. Everything in the demo-cut report's known issues still stands (no offline queue, `CONFLICT` instead of a merge sheet, half day on/off rather than 0.5, no reminders/register/alerts).

## 8. Sign-off

Builder: local gate green (format, typecheck, lint, test, every `scripts/check-*.mjs`, web build, full pgTAP). CI: see PR #58.
