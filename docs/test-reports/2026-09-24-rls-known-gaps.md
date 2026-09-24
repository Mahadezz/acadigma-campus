# Test Report — RLS `KNOWN_GAPS` closure (D-56)

|         |                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Feature | D-56 follow-up — `scripts/check-coverage-test-files.mjs` `KNOWN_GAPS` shrink-only allowlist (added in PR #17)           |
| Part    | Isolation + escalation pgTAP for the five allowlisted tables                                                            |
| Spec    | `supabase/tests/README.md`; ARCHITECTURE §9 ("every new tenant table needs an isolation case … and an escalation case") |
| PR      | #18 — test(db): isolation + escalation tests for the 5 KNOWN_GAPS tables                                                |
| Status  | **PASS**                                                                                                                |
| Date    | 2026-09-24                                                                                                              |
| Run by  | Claude (Sonnet 5, builder session)                                                                                      |

---

## 1. Scope

**What this Part is.** PR #17 (`feat/m0-wrapup`, not yet merged at the time this branch was cut) adds `scripts/check-coverage-test-files.mjs`, a static, shrink-only `KNOWN_GAPS` allowlist of five `public` tables that carry a `workspace_id` column but had no pgTAP file mentioning them: `consent_records`, `legal_acceptances`, `email_log`, `file_access_log`, `subscription_events`. An Opus review of that PR confirmed each of the five already has RLS enabled, a `SELECT`-only grant to `authenticated` (no grant to `anon` at all) and no write policy anywhere — so the gap was a missing test, not a missing control. This Part writes that test, one new file, `supabase/tests/14_rls_known_gaps.sql` (51 assertions), so the five names can come out of `KNOWN_GAPS` once PR #17 merges.

No migration, application code or RLS policy is touched. This is a tests + docs PR.

**Acceptance criteria covered:**

| #    | Criterion                                                                                           | Covered by                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| AC-1 | A member of workspace A reads zero rows of workspace B, per table                                   | `supabase/tests/14_rls_known_gaps.sql`, all 5 tables                                                                    |
| AC-2 | `anon` holds no `SELECT` privilege on any of the five tables                                        | same file, `has_table_privilege('anon', …)` per table                                                                   |
| AC-3 | A non-owner/admin member (teacher/staff) sees only what the policy allows — nothing, for 3 of the 5 | same file — `file_access_log`, `email_log`, `subscription_events` assert 0 even for a row about the caller's own action |
| AC-4 | The row's own user sees their own row where the policy has an own-row branch                        | same file — `consent_records` (`consenting_user_id`), `legal_acceptances` (`user_id`)                                   |
| AC-5 | Platform admin sees every workspace's rows                                                          | same file, all 5 tables                                                                                                 |
| AC-6 | Authenticated `INSERT`/`UPDATE`/`DELETE` are refused (`42501`) on all five tables                   | same file, 3 escalation assertions per table (15 total)                                                                 |

**Out of scope:** everything else in PR #17 (the `check-coverage-test-files.mjs` script itself, `coverage.sql`, the rest of the M0 wrap-up). This branch was cut from `main`, not from `feat/m0-wrapup`, precisely so it does not depend on that PR merging first — see §8 for the follow-up this implies.

**Risk areas:** getting each table's actual policy shape right from the migration text rather than assumption — in particular, confirming that `file_access_log`, `email_log` and `subscription_events` have **no** own-row branch at all (unlike `consent_records`/`legal_acceptances`), so the correct assertion for "the acting user reads their own log row" is that it is invisible, not visible.

---

## 2. Environment

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| Commit         | `a1cf502`                                                                                    |
| Branch         | `test/rls-known-gaps`, cut from `origin/main`                                                |
| Base           | `main`                                                                                       |
| CI run         | [36002920933](https://github.com/Mahadezz/acadigma-campus/actions/runs/36002920933) — PR #18 |
| Preview URL    | n/a — no UI change                                                                           |
| Supabase       | not reachable from this sandbox — no Docker, no local Postgres                               |
| Migration head | unchanged — no migration in this PR                                                          |
| Seed           | `supabase/seed` — unchanged                                                                  |
| Node / pnpm    | v24.x / 10.x                                                                                 |
| Browsers       | n/a                                                                                          |
| Feature flags  | none                                                                                         |

---

## 3. Unit and integration (Vitest)

No `apps/`/`packages/` code changed. `pnpm test` (`vitest run --coverage`) was run locally as part of the pre-push gate to confirm nothing regressed: **49 test files, 673 tests, 673 passed, 0 failed.** Coverage unaffected (this PR adds no source file). CI's `unit` job also ran and passed independently.

---

## 4. Database (pgTAP)

**Not run locally** — no Docker, no local Postgres and no reachable Supabase project in this sandbox. CI's `db` job (fresh Postgres 17 + pgTAP, all migrations applied in order, then `supabase test db`) is the real gate for this PR, and it has now run — see the result below.

| Table                 | Isolation assertions                                                                                           | Escalation assertions                | Result | File                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ | -------------------------------------- |
| `consent_records`     | 8 — own-row, cross-tenant, non-owner-in-workspace, owner/admin, platform admin, anon grant                     | 3 — INSERT/UPDATE/DELETE all `42501` | PASS   | `supabase/tests/14_rls_known_gaps.sql` |
| `legal_acceptances`   | 8 — own-row, cross-tenant, non-owner-in-workspace, owner/admin, platform admin, anon grant                     | 3 — INSERT/UPDATE/DELETE all `42501` | PASS   | `supabase/tests/14_rls_known_gaps.sql` |
| `file_access_log`     | 6 — no own-row branch (subject of the row still sees 0), cross-tenant, owner/admin, platform admin, anon grant | 3 — INSERT/UPDATE/DELETE all `42501` | PASS   | `supabase/tests/14_rls_known_gaps.sql` |
| `email_log`           | 7 — no own-row branch, cross-tenant, owner/admin, platform admin, anon grant                                   | 3 — INSERT/UPDATE/DELETE all `42501` | PASS   | `supabase/tests/14_rls_known_gaps.sql` |
| `subscription_events` | 7 — no own-row branch, cross-tenant, owner/admin, platform admin, anon grant                                   | 3 — INSERT/UPDATE/DELETE all `42501` | PASS   | `supabase/tests/14_rls_known_gaps.sql` |

51 assertions total (`plan(51)`), one file, self-contained fixtures (`tests.mkuser`/`login`/`logout` duplicated per house style), everything inside `begin`/`rollback`.

**CI result (pg_prove), PR #18 head `a1cf502`, run [36002920933](https://github.com/Mahadezz/acadigma-campus/actions/runs/36002920933):**

```
supabase/tests/14_rls_known_gaps.sql ............. ok
All tests successful.
Files=13, Tests=326,  1 wallclock secs ( 0.07 usr  0.01 sys +  0.24 cusr  0.07 csys =  0.39 CPU)
Result: PASS
```

`14_rls_known_gaps.sql` ran its full `plan(51)` (`1..51`) and reported `ok` — all 51 assertions passed. The full suite is now 13 files, 326 tests total, all passing.

**Specifically proven:**

- A member of workspace A reads zero rows of every one of the five tables scoped to workspace B.
- `anon` has no `SELECT` privilege at all on any of the five — not merely an empty result set.
- `file_access_log`'s subject-of-the-row user cannot read the very access-log entry about their own download; only `has_role(owner, admin)` or a platform admin can.
- `consent_records`/`legal_acceptances` each grant their own-row branch independently of workspace role — a teacher sees their own consent/acceptance but not a colleague's, in the same workspace.
- `subscription_events` is tighter than `usage_counters`: a non-owner/admin member of the school cannot read their own school's billing timeline, even though every member can read its usage counters.
- All five tables refuse authenticated `INSERT`/`UPDATE`/`DELETE` with `42501` because `authenticated` holds no write `GRANT` on any of them at all — the write attempt fails before any policy is even consulted.

---

## 5. End to end (Playwright)

Not applicable — no UI or route changed in this Part.

---

## 6. Performance

Not applicable — no new query added to an application code path; these are pgTAP-only assertions run in CI's ephemeral Postgres.

---

## 7. Security checks

| Check                           | Result                                                  |
| ------------------------------- | ------------------------------------------------------- |
| gitleaks / secret scan          | PASS — CI `security` job, run 36002920933               |
| Semgrep                         | PASS — CI `security` job, run 36002920933               |
| `pnpm audit --audit-level high` | not run in this session — no dependency changes         |
| Supabase advisors               | not applicable — no reachable project, no schema change |
| Authorized DAST                 | not applicable — no new endpoint or UI surface          |

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                           | Severity          | Ship anyway?                                                                                                                                                                                                                       | Tracked |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | `supabase/tests/14_rls_known_gaps.sql` was authored against the RLS policies as they read on `main` and reviewed by eye before running — resolved: CI's `db` job ran it for real and it passed (§4, §10)                                                                                                                                                        | ~~high~~ resolved | —                                                                                                                                                                                                                                  | —       |
| 2   | This branch cannot remove the five table names from `scripts/check-coverage-test-files.mjs`'s `KNOWN_GAPS` in this same PR: that script does not exist on `main` yet — it ships in PR #17 (`feat/m0-wrapup`), still open as of 2026-09-24                                                                                                                       | medium            | yes — deliberate. Once #17 merges, this branch merges `origin/main` and removes the five entries from `KNOWN_GAPS` (the shrink-only check will otherwise fail); see the PR description                                             | —       |
| 3   | This PR's `report` CI job (a github-script step that posts/updates a PR-summary comment) failed with "recent account payments have failed or your spending limit needs to be increased" — a GitHub Actions billing condition on the account, unrelated to this PR's code. The identical job is failing the same way, at the same time, on the still-open PR #17 | low               | yes — the job only posts a comment; it gates nothing this PR's code touches, and every substantive job (`lint`, `typecheck`, `db`, `unit`, `contracts`, `build`, `security`, `e2e`, `lighthouse`, `changeset`, `docs-sync`) passed | —       |

**Deliberately not tested, and why:**

- The `scripts/check-coverage-test-files.mjs` mechanism itself (its `KNOWN_GAPS` shrink-only enforcement) — that script is PR #17's own responsibility, not this PR's; this PR only supplies the test file the mechanism will eventually stop needing to allowlist.

---

## 9. Sign-off

| Definition of Done                           | Met                                                           |
| -------------------------------------------- | ------------------------------------------------------------- |
| Spec written and matches the build           | ☑ (ARCHITECTURE §9, D-56)                                     |
| Migration + pgTAP isolation and escalation   | ☑ written / ☑ executed — CI `db` job, PASS (§4, §10)          |
| Unit tests + coverage thresholds             | n/a — no application code changed (673/673 local, CI green)   |
| UI built and verified at both viewports      | ☐ n/a — no UI change                                          |
| Playwright journey at both viewports         | ☐ n/a — no new journey; CI `e2e` job unaffected and green     |
| a11y — zero serious/critical + manual checks | ☐ n/a — no UI change                                          |
| This test report, with real numbers          | ☑ (§4, §10 — real `pg_prove` output pasted)                   |
| Docs updated in the same PR                  | ☑ (`docs/README.md`, `supabase/tests/README.md`, this report) |

**Signed off by:** Claude (Sonnet 5, builder session)
**Date:** 2026-09-24
**Commit:** `a1cf502` (PR #18 head at CI-green time)

> This PR adds tests and docs only — no migration, no application code. `supabase/tests/14_rls_known_gaps.sql` was written from the actual policy text in `supabase/migrations/20260917010200_audit_and_files.sql` and `20260917010300_plans_and_notifications.sql`, not from assumption, and reviewed by eye against the house style in `02_tenant_isolation.sql`/`03_role_escalation.sql`/`11_tenancy_tripwire_status.sql` before ever running. It was **not** run against a real Postgres in this sandbox (no Docker, no local Postgres) — CI's `db` job is the required, real gate, and it has now run: PASS, 51/51 assertions, no defect found. See §10.

---

## 10. Addendum — CI results, 2026-09-24

**CI on head `a1cf502` (PR #18), run [36002920933](https://github.com/Mahadezz/acadigma-campus/actions/runs/36002920933):** every substantive check passed — `lint`, `typecheck`, `db`, `unit`, `contracts`, `build`, `security`, `e2e`, `lighthouse`, `changeset`, `docs-sync`, `sql-lint`. The `db` job's `pg_prove` output:

```
supabase/tests/14_rls_known_gaps.sql ............. ok
All tests successful.
Files=13, Tests=326,  1 wallclock secs
Result: PASS
```

`14_rls_known_gaps.sql` reported `1..51` and `ok` — all 51 written assertions ran and passed, confirming §4's table for real. No RLS gap, leak or unexpected grant was found in any of the five tables: the isolation and escalation behaviour matches exactly what the Opus review of PR #17 described.

The only failing check on this PR is `report`, a github-script step that posts a PR-summary comment. Its log reads: _"The job was not started because recent account payments have failed or your spending limit needs to be increased."_ — a GitHub Actions billing condition on the repository/account, not a code or test defect. The same job is failing identically, at essentially the same timestamp, on PR #17 (`feat/m0-wrapup`), which this PR did not touch — confirming it is an account-wide condition, not something introduced here. It posts a comment only and gates nothing; every check that verifies this PR's actual content passed.

**Follow-up status:** PR #17 was still **OPEN** (not merged) at the time this addendum was written, so the `KNOWN_GAPS` edit in `scripts/check-coverage-test-files.mjs` described in this PR's description has not been done yet — that script does not exist on `main`. It remains the required follow-up once #17 merges.
