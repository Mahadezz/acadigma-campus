# Test Report — Security and test hardening lane, Part 1: audit of `main`

|         |                                                                                         |
| ------- | --------------------------------------------------------------------------------------- |
| Feature | Security and test hardening lane (lead lane, D-75)                                      |
| Part    | 1 — audit of what is merged on `main` (after #86), with tests and minimal fixes         |
| Spec    | Owner direction 2026-09-27; `docs/decisions/DECISION-LOG.md` D-75                       |
| PR      | #87                                                                                     |
| Status  | **PASS WITH KNOWN ISSUES** (four MEDIUM findings fixed; LOW/latent items handed on, §6) |
| Date    | 2026-09-27                                                                              |
| Run by  | Claude (security lane builder)                                                          |

---

## 1. Scope

**What this Part is.** No feature. An audit of the security boundary already on `main`: every SECURITY DEFINER function, RLS and grants on every tenant table, the SECURITY INVOKER readers a parent can call, PostgREST `max_rows` truncation, and every server action and route handler. Every real finding got a failing test first, then the smallest fix.

**Method.** A local `postgres:17` + pgTAP container that mirrors CI's `db` job (bootstrap, every migration in order, `coverage.sql`, `pg_prove`). Catalog queries enumerated every definer function (`pg_proc.prosecdef`, `proconfig`, execute grants), every table grant and policy (`pg_policies`), and every foreign key from a tenant table. Hypotheses were probed live as the attacker role in rolled-back transactions. For PostgREST behaviour, a separate local Supabase stack (own `project_id`, ports 544xx, so it could not touch another lane's stack) ran the `*.integration.test.ts` files. Checklists used: `offensive-idor`, `offensive-business-logic`, `offensive-api-security`, `supabase-postgres-best-practices`.

**Out of scope for this Part** (Part 2, §7): e2e/Playwright attack journeys, storage (`storage.objects`) policies, the unbuilt `/api/files/[id]` route, rate limits at the HTTP edge.

---

## 2. Environment

|                |                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Branch         | `test/security-audit-p1` from `origin/main` @ `f438896`                                                     |
| Local pgTAP    | `postgres:17` + `postgresql-17-pgtap` in Docker, CI's `supabase/ci/bootstrap.sql`                           |
| Local stack    | Supabase CLI 2.117.0 (`supabase start --workdir`, isolated `project_id`), real PostgREST, `max_rows = 1000` |
| Migration head | `20260926182848_security_audit_p1.sql`                                                                      |
| Node / pnpm    | v24.19.0 / 10.34.5                                                                                          |

---

## 3. Findings

| #   | Severity         | Finding                                                                                                                                                                                                                                                                                                                                                           | Proof (failing first)                                                                                                  | Status                                                                                                                                        |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | MEDIUM           | `profiles.email`/`phone` were self-editable through `profiles_update_self`. A user set their email to someone else's address and read that person's pending invitations (`workspace_invitations_select` trusts `app.current_email()`). The unique `profiles_email_key` also let them squat the address, so `app.handle_new_user` failed the real owner's sign-up. | `23_security_audit_identity.sql` A (tests 2, 3, 4, 6 red on `main`)                                                    | **Fixed**: `app.tg_profiles_guard` refuses non-privileged changes                                                                             |
| F2  | MEDIUM (latent)  | `staff_documents.file_id` referenced `files(id)` alone and the self-upload policy did not check the file. A teacher could attach a colleague's NID scan, or another school's file, to their own record, and `app.can_open_staff_document` (the `/api/files` guard) then approved it. The route is unbuilt, so this is not reachable yet.                          | `23_…` B (tests 9–12 red on `main`)                                                                                    | **Fixed**: composite FK `(file_id, workspace_id)`; the self path requires the caller's own file                                               |
| F3  | MEDIUM           | `listPublishCandidates` read a whole exam's `results` in one PostgREST request. With 1,005 results it returned exactly 1,000 and no error, so the publish sheet (and its withhold list) silently lost students.                                                                                                                                                   | `results.integration.test.ts`: `expected [ Array(1000) ] to have a length of 1005` on `main`                           | **Fixed**: pages with `.order("id").range()`                                                                                                  |
| F4  | MEDIUM (latent)  | `workspace_invitations_insert`/`_update` let an admin write `role = 'owner'`, a rule `app.create_invitation` enforces but a direct write skipped (the #79 class). `app.accept_invitation` then makes the invitee an owner. Staff-invite acceptance is not exposed yet.                                                                                            | `23_…` C (tests 13, 14 red with the old policies); live probe: the invitee became `owner`                              | **Fixed**: both policies require an owner for an owner-role row                                                                               |
| Q1  | LOW (queued #76) | A parent must get `{"section": null}` from `attendance_register`.                                                                                                                                                                                                                                                                                                 | `24_parent_invoker_reads.sql`, which also covers `attendance_day`, `student_import_existing` and `exam_marks_progress` | **No bug**: passes on `main`, test kept as a regression                                                                                       |
| L1  | LOW (latent)     | `report_runs_insert` accepts client-set `status`, `file_id`, `completed_at`, … (a teacher can insert a `ready` run). No exposure today: `/api/pdf/[runId]` re-renders through the caller's RLS and never serves `file_id`. It matters once stored PDFs are served.                                                                                                | live probe                                                                                                             | **Handed on**: operations lane / Part 2 (insert check `status = 'queued' and file_id is null`, composite file FK)                             |
| L2  | LOW              | `workspace_members_update_self` lets a member change their own `joined_at`, `invited_by`, `invitation_id`, `employee_code`, `department`, `subjects`, `phone`, `label_id`. The guard only locks role, status and ids. This is integrity only: nothing authorizes on these today.                                                                                  | live probe                                                                                                             | **Handed on**: identity lane / Part 2 (an allow-list like the staff-records guard)                                                            |
| L3  | LOW              | `data_requests_insert` checks requester and status but not `workspace_id`, so any user can file a request into any school's queue (spam).                                                                                                                                                                                                                         | policy text                                                                                                            | **Handed on**: Part 2 (require membership when `workspace_id` is set)                                                                         |
| L4  | LOW (latent)     | `workspace_member_capabilities` is writable by any admin, including for themselves. No capability gates anything yet (`fees.cashier` is future).                                                                                                                                                                                                                  | policy text; `has_capability` unused                                                                                   | **Handed on**: whoever builds the first capability-gated action                                                                               |
| L5  | LOW              | `files_insert` lets teacher/staff create `visibility = 'public'` rows, which `files_select_public` shows to `anon` (metadata only; storage is not wired).                                                                                                                                                                                                         | policy text                                                                                                            | **Handed on**: Part 2, with storage policies                                                                                                  |
| A1  | —                | Anon `throttle_reset`/`throttle_record_failure` on non-user keys.                                                                                                                                                                                                                                                                                                 | —                                                                                                                      | **Accepted**: keys are salted with the server secret `THROTTLE_KEY_SALT` (`apps/web/lib/request-context.ts`), so a caller cannot compute them |
| A2  | —                | Trigger functions (`tg_audit`, `tg_workspace_bootstrap`, `tg_workspace_billing_bootstrap`, `handle_new_user`) carry an `authenticated` execute grant.                                                                                                                                                                                                             | —                                                                                                                      | **Accepted**: `app` is not exposed, and a trigger function cannot be called outside a trigger                                                 |
| A3  | —                | `save_grade_scale`/`seed_bd_grade_scale` raise prose messages, not named codes, and rely on `has_role` being false for a null `auth.uid()`.                                                                                                                                                                                                                       | —                                                                                                                      | **Accepted**: correct behaviour, cosmetic                                                                                                     |
| A4  | —                | `updateLocale` validates with the `isLocale` guard, not Zod.                                                                                                                                                                                                                                                                                                      | —                                                                                                                      | **Accepted**: validated at the boundary                                                                                                       |

### Audited and found sound

- **SECURITY DEFINER (99 functions in `app`/`public`):** all pin `search_path = ''`. Every client-callable `public` RPC (`admit_student`, `save_attendance`, `save_marks`, `submit/lock/unlock_exam_subject`, `publish_results`, `compute_results`, `import_student_batch`, `invite_guardian`, `revoke_guardian_link`, `save_grade_scale`, `seed_bd_grade_scale`, `family_results`, …) checks `auth.uid()` and `app.has_role(p_workspace_id, …)`, then locks and reads the target row with `workspace_id = p_workspace_id`, so the row's school is always the checked school. `app.has_role` requires `status = 'active'`, which keeps out removed and suspended members. Parents reach only `family_results` (parent role and `is_guardian_of`) and the guardian-invite functions. The #78 self-reactivation path (`accept_guardian_invitation` plus the members guard) requires an invitation accepted by the caller in the same transaction. `family_results` returning withheld rows is intended: a withheld result is frozen with no marks.
- **Direct writes vs RPC rules (#79 class):** `attendance_*`, `marks`, `results`, `guardian_users` and `grade_bands` have no client write grant. `exams` and `exam_subjects` transitions are enforced by triggers (`tg_exams_status_guard`, `tg_exams_publish_gate`, `tg_exam_papers_lock`), whatever path makes the write. Unlock needs the RPC-only `app.unlock_via_rpc` setting. F4 was the one gap.
- **Cross-tenant references:** every FK between tenant tables is composite on `workspace_id`, except `staff_documents.file_id` (F2, fixed), `report_runs`/`report_run_items`/`data_requests.file_id` (L1, not served), `staff_records.membership_id` and the `label_id` FKs (labels are display-only).
- **RLS:** parents read only their linked, non-deleted children (`students_select_guardian`) and their published, non-withheld results. Teachers and staff do not see soft-deleted students. `workspace_id` is immutable on every tenant table (`tg_freeze_workspace`, members guard). Role and status self-changes are refused.
- **Server actions (53) and routes (6):** every workspace-scoped write parses with Zod, resolves context with `requireWorkspace()`, checks `can()` and calls `requireWritable` (directly or through a same-file gate helper; `check-require-writable.mjs` agrees). Auth, onboarding and invite actions run before a workspace exists, and their RPCs do the checks. `/api/pdf/[runId]` and `/api/family/report-card` validate UUIDs, check `can()`, and read through the caller's RLS client. The cron route compares its bearer secret in constant time and fails closed. The auth callback validates `next` with `safeReturnTo`.
- **`max_rows`:** all other repository list reads are bounded by a section, a paper, a student or a page (`listRoster` pages; `exam_marks_progress`, `attendance_register` and `student_import_existing` return one jsonb value). Embedded arrays are not capped: `getExam`'s embedded papers passed in the same run.

---

## 4. Test results

### Local (every number from a real run)

| Suite                                                 | Result                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| pgTAP, `main` baseline                                | 45 files, 1,298 tests, PASS                                                                             |
| pgTAP, this branch                                    | 47 files, 1,319 tests, PASS (new: `23_security_audit_identity.sql` 15, `24_parent_invoker_reads.sql` 6) |
| `23_…` before the migration                           | 8 of the first 12 assertions red (A2–A4, A6, B9–B12); C13–C14 red with the old policies restored        |
| Integration (`*.integration.test.ts`, real PostgREST) | before the fix: 1 failed (1,000 ≠ 1,005), 7 passed; after: 4 files, 8 tests passed                      |
| Vitest (`pnpm test`)                                  | 152 files passed, 4 skipped; 1,541 tests passed, 8 skipped                                              |
| Coverage (all files)                                  | statements 87.47 %, branches 78.25 %, functions 86.79 %, lines 90.11 %                                  |
| typecheck / lint / format                             | pass / pass / pass                                                                                      |

### CI

[Run 36263806282](https://github.com/Mahadezz/acadigma-campus/actions/runs/36263806282) on `8d4dd71` (draft; `e2e` and `lighthouse` are skipped on drafts and run once the PR is ready):

| Job                                                                                                  | Result                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `db`                                                                                                 | pass: append-only, order, generated types match, RLS coverage; pgTAP `Files=47, Tests=1319, Result: PASS` |
| `db-integration`                                                                                     | pass: 4 files (`academics`, `attendance-register`, `marks`, `results`), all passed against real PostgREST |
| `unit`                                                                                               | pass: 152 files passed, 4 skipped; coverage 87.47 / 78.25 / 86.79 / 90.11 %                               |
| `typecheck`, `lint`, `build`, `contracts`, `security`, `changeset`, `docs-sync`, `sql-lint`, Semgrep | pass                                                                                                      |

---

## 5. Security checks

The findings table in §3 is the security check for this Part. New migration: `20260926182848_security_audit_p1.sql` (profiles guard; `files_id_workspace_key` plus the `staff_documents_file_fkey` composite FK; `staff_documents_insert`, `workspace_invitations_insert` and `workspace_invitations_update` policies). No new client-callable function, so no new grants.

---

## 6. Known issues

- L1–L5 above are open and handed on. None exposes data today.
- F2 and F4 were latent: the code paths that make them exploitable (`/api/files/[id]`, a PostgREST-reachable staff-invite accept) are not built yet. The fixes land first so those Parts start safe.
- Production data check before the deploy: the new composite FK validates existing `staff_documents` rows. If any row names a file from another school, the migration fails, and that would itself be evidence of misuse worth investigating. The table is expected to be empty (the staff documents UI is unbuilt).

## 7. What is left for Part 2

Playwright attack journeys (tenant switching, a forged `x-workspace-id`, a parent reaching `/app` routes) on port 3110; storage/`storage.objects` policies and the files route when they land; L1–L5; a sweep of `app.*` definer functions (unreachable from PostgREST today, but reachable through any future `public` wrapper); rate limits at the HTTP edge.

## 8. Sign-off

Ready for lead review. Not merged by the builder.
