# Test Report: Security and test hardening lane, Part 2 (Part 1's hand-ons and the definer sweep)

|         |                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------- |
| Feature | Security and test hardening lane (lead lane, D-77)                                                |
| Part    | 2: fix D-75's L1–L5, sweep `app.*` SECURITY DEFINER functions, one-off `staff_documents` check    |
| Spec    | `docs/decisions/DECISION-LOG.md` D-75 (hand-ons) and D-77; `2026-09-27-security-audit-p1.md` §6–7 |
| PR      | #94                                                                                               |
| Status  | **PASS** (five hand-ons and one sweep finding fixed; storage/e2e attack journeys stay open, §6)   |
| Date    | 2026-09-27                                                                                        |
| Run by  | Claude (security lane builder)                                                                    |

---

## 1. Scope

**What this Part is.** It builds no feature. It closes the five items Part 1 handed on (L5 first, before storage or the files route lands), sweeps every `app` SECURITY DEFINER function, and writes the one-off `staff_documents` check. Each finding got a failing test first (`25_security_audit_p2.sql`: 22 of 33 assertions red on `main`), then the smallest fix. Checklists used: `offensive-idor`, `offensive-business-logic`, `offensive-api-security`, `supabase-postgres-best-practices`.

**Method.** A local `postgres:17` + pgTAP container mirroring CI's `db` job (bootstrap, every migration, `coverage.sql`, `pg_prove`), plus catalog queries over `pg_proc` (`prosecdef`, `proconfig`, ACLs) and a caller map: which policies, invoker functions and definer functions reference each `app` function. PostgREST behaviour ran on a separate local Supabase stack with its own `project_id` and ports 545xx, so it never touched the stack the other lanes share.

**Out of scope** (§7): Playwright attack journeys, `storage.objects` policies and the unbuilt `/api/files/[id]` route, rate limits at the HTTP edge.

---

## 2. Environment

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| Branch         | `test/security-audit-p2` from `origin/main` @ `889257b`                          |
| Local pgTAP    | `postgres:17` + `postgresql-17-pgtap`, CI's `supabase/ci/bootstrap.sql`          |
| Local stack    | Supabase CLI 2.117.0, isolated `project_id = secp2`, ports 545xx, real PostgREST |
| Migration head | `20260926215147_security_audit_p2.sql`                                           |
| Node / pnpm    | v24.19.0 / 10.34.5                                                               |

---

## 3. Findings

| #   | Severity        | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Proof (failing first)                                                                                    | Status                                                                                                                                                                  |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L5  | MEDIUM (latent) | `files`: a teacher could create a `public` row (insert, or update a private one to public). `files_select_public` showed public rows to `anon` and to every signed-in user of any school, and `original_name` can carry a child's name. `files_insert` took any `bucket`/`path`, so a teacher could register a path another uploader or the server was about to use. A client could also set `virus_scan_status = 'clean'`, `download_count` and `purge_after`, and later move `path`.                     | `25_…` A1–A4, A6, A7, A11, A12                                                                           | **Fixed**: path under `<ws>/<uid>/`; public only for owner/admin; no `anon` grant, public rows readable by the school's staff only; column grants for insert and update |
| L1  | LOW (latent)    | `report_runs_insert` accepted client-set `status`, `file_id`, timings, `expires_at`, so a run could be born `ready`.                                                                                                                                                                                                                                                                                                                                                                                       | `25_…` B1, B2; `reports.integration.test.ts` red with the old grant (`expected undefined to be '42501'`) | **Fixed**: column-level INSERT grant on what `createReportRun` sends                                                                                                    |
| L2  | LOW             | A member could PATCH their own `joined_at`, `invited_by`, `invitation_id`, `employee_code`, `label_id`, and an admin could rewrite anyone's `joined_at`.                                                                                                                                                                                                                                                                                                                                                   | `25_…` C1–C3, C5                                                                                         | **Fixed**: the members guard refuses a direct client change to the provenance columns; own-row edits are limited to `phone`, `department`, `subjects`                   |
| L3  | LOW             | `data_requests_insert` did not check `workspace_id`, so anyone could file into any school's queue. A requester could also set their own `due_on`.                                                                                                                                                                                                                                                                                                                                                          | `25_…` D1, D4                                                                                            | **Fixed**: a school request needs a role in that school (otherwise it is filed platform-level); column-level INSERT grant                                               |
| L4  | LOW (latent)    | Any admin could grant themselves, or a peer admin, a capability (`fees.cashier`).                                                                                                                                                                                                                                                                                                                                                                                                                          | `25_…` E1, E2 (E3, E4 cascade)                                                                           | **Fixed**: capability writes are owner-only                                                                                                                             |
| S1  | LOW (latent)    | `authenticated` held EXECUTE on `app` writers that check nothing. `log_audit_event` writes any school's audit trail with any catalogued action, `notify` writes to anyone's inbox, `record_consent` forges consent into any school, `next_id` burns any school's counters, `log_file_access` logs against any file and bumps `download_count`, and `is_adult` reports any user's age band and has no caller. `app` is not exposed by PostgREST, so a future `public` invoker wrapper was the only path in. | `25_…` F3, F4                                                                                            | **Fixed**: EXECUTE revoked from `authenticated` (all callers are definer functions or triggers); F4 pins the remaining allowlist with a reason per entry                |
| N1  | note            | A client cannot soft-delete a `files` row: `files_select_member`'s `deleted_at is null` also applies to the updated row, so `set deleted_at = now()` fails RLS for everyone. This is true on `main` today.                                                                                                                                                                                                                                                                                                 | found writing A8                                                                                         | **Documented**: soft delete is a server action (DATA-MODEL §7.2); `deleted_at` is not in the update grant                                                               |

### Review follow-ups (#94, security and DB reviewers)

Each got a red `25_…` assertion first (G1–G7: 6 red, G4 already green as the keep-working check), then the fix in the same migration (edited in place; it has not been applied live).

| #   | Severity | Finding                                                                                                                               | Proof      | Fix                                                                                                                                                                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | MEDIUM   | Owners/admins still had table-wide UPDATE on `data_requests`, so they could rewrite `due_on`, `requester_user_id`, `subject_id`.      | G2, G3, G4 | Table UPDATE revoked; column grant on `status, legal_hold_reason, refusal_reason, completed_at` (no app code updates the table yet). `10_tenancy_cascade` 1–2 now see the grant refuse first. |
| R2  | LOW      | The `files` `owner_id = auth.uid()` branch had no membership check: a removed teacher could still read and update their own rows.     | G6, G7     | `and app.member_role(workspace_id) is not null` on that branch of SELECT and UPDATE                                                                                                           |
| R3  | LOW      | `starts_with(path, '<ws>/<uid>/')` accepted `..` segments.                                                                            | G1         | `and path !~ '(^\|/)\.\.(/\|$)'` on INSERT                                                                                                                                                    |
| R4  | LOW      | The members provenance lock covered UPDATE only; a client INSERT could forge `invited_by`, `joined_at`, `created_by`, removal stamps. | G5         | The guard overwrites them on a client INSERT (`current_user` `authenticated`/`anon`); no self-service exception, definer paths unchanged                                                      |
| R5  | LOW (DB) | Six bare `drop policy`.                                                                                                               | —          | `drop policy if exists`                                                                                                                                                                       |

### Sweep: audited and found sound

- **All SECURITY DEFINER functions in `app`/`public`** pin `search_path = ''` (`25_…` F1), and none is executable by PUBLIC (F2). `anon` holds EXECUTE on `pre_request`, `log_auth_event` and `throttle_*` only (`12_function_grants_invariant.sql`).
- **`app` definer functions still granted to `authenticated`** (F4, 38 entries). Each one is in one of these groups:
  - a policy or invoker helper that is scoped to the caller (`has_role`, `member_role`, `is_guardian_of`, `can_*`, `current_*`, `shares_active_workspace`, `has_capability`);
  - needed by an invoker caller (`count_active_owners` for the members guard; `school_today`, `attendance_edit_window_days` and `is_school_day` for `public.attendance_day`);
  - a function that checks the caller itself (`create_invitation`, `rotate_invite_code`, `transfer_ownership`, `set_workspace_context`, `set_access_mode`, `staff_hourly_rate`, `workspace_plan`, `within_limit`, `school_days`);
  - a function that acts only on the caller's own token or code (`accept_invitation`, `decline_invitation`, `join_workspace_by_code`);
  - a trigger (A2, D-75).
- **Client-callable `public` RPCs:** unchanged since D-75. Each checks `auth.uid()` and `has_role` on the workspace it is passed, then touches only rows of that workspace.

### One-off check: no `staff_documents` row points at a colleague's file

Read-only. Run it once in the hosted SQL editor; it is not a migration and is not run by CI. The composite FK from D-75 already proves the file belongs to the same school. This query finds rows whose file is owned by someone other than the staff member, where that person is also not an owner or admin of the school (an admin uploading on a teacher's behalf is legitimate). The expected result is 0 rows; the table is expected to be empty because the staff-documents UI is unbuilt. Any row it returns is evidence of misuse: investigate it before deleting anything.

```sql
select sd.id as document_id, sd.workspace_id, sd.staff_record_id,
       sr.user_id as staff_user_id, sd.file_id, f.owner_id as file_owner_id,
       sd.uploaded_by, sd.created_at
  from public.staff_documents sd
  join public.staff_records sr
    on sr.id = sd.staff_record_id and sr.workspace_id = sd.workspace_id
  join public.files f on f.id = sd.file_id
 where f.owner_id is distinct from sr.user_id
   and not exists (select 1 from public.workspace_members m
                    where m.workspace_id = sd.workspace_id
                      and m.user_id = f.owner_id
                      and m.role in ('owner', 'admin'))
 order by sd.created_at;
```

Checked locally against the full migration set: it parses and returns 0 rows.

---

## 4. Test results

### Local (every number from a real run)

| Suite                                                 | Result                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| pgTAP, `main` baseline                                | 48 files, 1,380 tests, PASS                                                                                        |
| `25_security_audit_p2.sql` on `main`'s schema         | 22 of 33 red (A1–A4, A6, A7, A11, A12, B1, B2, C1–C3, C5, D1, D4, E1–E4, F3, F4)                                   |
| pgTAP, this branch                                    | 49 files, 1,413 tests, PASS (`40_report_runs.sql` test 5 now asserts the column-level grant)                       |
| #94 follow-ups: `25_…` G1–G7 before the fix           | 6 of 7 red (G4 is the keep-working check); after: 40/40 pass                                                       |
| #94 follow-ups: every pgTAP file with the migration   | pass, except `22_` and `36_`, which fail identically without it (local seed data on the shared stack; CI is clean) |
| Integration (`*.integration.test.ts`, real PostgREST) | 7 files, 18 tests passed; new `reports.integration.test.ts` red with the old table-wide grant, green after         |
| Vitest (`pnpm test`)                                  | 160 files passed, 7 skipped; 1,632 tests passed, 18 skipped (the first run had one timeout that passed on rerun)   |
| Coverage (all files)                                  | statements 87.36 %, branches 78.22 %, functions 86.83 %, lines 90.00 %                                             |
| typecheck / lint / format / every `scripts/check-*`   | pass                                                                                                               |
| `pnpm --filter @acadigma/web build`                   | pass                                                                                                               |

### CI

[Run 36274683185](https://github.com/Mahadezz/acadigma-campus/actions/runs/36274683185) on `a20e113` (draft; `e2e` and `lighthouse` are skipped on drafts):

| Job                                                                                                  | Result                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `db`                                                                                                 | pass: append-only, order, generated types match, RLS coverage; pgTAP `Files=49, Tests=1413, Result: PASS` |
| `db-integration`                                                                                     | pass: 7 files, 18 tests against real PostgREST (includes `reports.integration.test.ts`)                   |
| `unit`                                                                                               | pass: 160 files passed, 7 skipped; 1,632 tests passed, 18 skipped                                         |
| `typecheck`, `lint`, `build`, `contracts`, `security`, `changeset`, `docs-sync`, `sql-lint`, Semgrep | pass                                                                                                      |

---

## 5. Security checks

The findings table in §3 is this Part's security check. New migration: `20260926215147_security_audit_p2.sql`. It changes the `files` policies and column grants, the `report_runs` and `data_requests` insert column grants, the `data_requests_insert` and `workspace_member_capabilities_write` policies, the `data_requests` update column grant and `app.tg_workspace_members_guard`, and revokes EXECUTE on six `app` functions from `authenticated`. It adds no function and no table.

**Safe to apply live:** it changes only policies, grants and one trigger function: no table rewrite, no index, no data change. It runs as one transaction, so the policy drops and creates hold an AccessExclusiveLock on four small tables until commit. They are near-empty in production and the migration finishes in well under a second, so this is fine as it is. Generated types are unchanged, because grants and policies are not part of them.

---

## 6. Known issues

- **Upload feature contract.** `files` rows outside `<ws>/<uid>/` are written server-side (service role or a definer function), which also sets `purge_after` and the virus-scan status. Client soft delete never worked (N1); it is a server action.
- **Staff screens.** A member can no longer self-edit `employee_code` or `label_id`. An owner or admin sets them.
- **L3 rate limit.** Not added. Requests are signed-in and scoped, so a spammer is identifiable. Add a per-requester cap of open requests if abuse appears.

## 7. What is left for Part 3

- Playwright attack journeys on port 3110/3120: tenant switching, a forged `x-workspace-id`, a parent reaching `/app` routes.
- `storage.objects` policies and `/api/files/[id]` when they land. The row rules above assume storage enforces the same `<ws>/<uid>/` prefix.
- Rate limits at the HTTP edge.

## 8. Sign-off

Ready for lead review. The builder has not merged it.
