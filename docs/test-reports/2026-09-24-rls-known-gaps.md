# Test Report — RLS `KNOWN_GAPS` closure (D-56)

|         |                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Feature | D-56 — `scripts/check-coverage-test-files.mjs` `KNOWN_GAPS` shrink-only allowlist (added in PR #17, merged `53a8393`)   |
| Part    | Isolation + escalation pgTAP for all six allowlisted tables — `KNOWN_GAPS` now empty                                    |
| Spec    | `supabase/tests/README.md`; ARCHITECTURE §9 ("every new tenant table needs an isolation case … and an escalation case") |
| PR      | #18 — test(db): isolation + escalation tests for the 5 KNOWN_GAPS tables                                                |
| Status  | **PASS**                                                                                                                |
| Date    | 2026-09-24                                                                                                              |
| Run by  | Claude (Sonnet 5, builder session)                                                                                      |

---

## 1. Scope

**What this Part is.** PR #17 (`feat/m0-wrapup`, merged as `53a8393`) added `scripts/check-coverage-test-files.mjs`, a static, shrink-only `KNOWN_GAPS` allowlist of `public` tables that carry a `workspace_id` column but had no pgTAP file mentioning them. It shipped with five entries — `consent_records`, `legal_acceptances`, `email_log`, `file_access_log`, `subscription_events` — and, once its own comment-matching bug was fixed in review, a sixth: `notifications`, previously hidden as "covered" by a stray mention in a `09_tenancy.sql` comment rather than a real test.

This PR writes the missing test for all six, in one file, `supabase/tests/14_rls_known_gaps.sql` (64 assertions), and removes all six entries from `KNOWN_GAPS` — the allowlist is now **empty**, which is its target state, not a special case (`scripts/check-coverage-test-files.mjs` confirms: "Coverage OK — 16 workspace_id tables; 16 named in a `supabase/tests/*.sql` file, 0 tracked in `KNOWN_GAPS`").

Five of the six (`consent_records`, `legal_acceptances`, `email_log`, `file_access_log`, `subscription_events`) already had RLS enabled, a `SELECT`-only grant to `authenticated` (no grant to `anon` at all) and no write policy anywhere — confirmed by an earlier Opus review. The sixth, `notifications`, turned out to be shaped differently on inspection of `supabase/migrations/20260917010300_plans_and_notifications.sql`: its `SELECT` policy is `recipient_id = auth.uid()` **only** — no `has_role(owner, admin)` branch and no platform-admin branch at all, stricter than the other five rather than weaker — and it carries real `UPDATE`/`DELETE` grants to `authenticated`, scoped by RLS to the caller's own rows and further guarded by a `BEFORE UPDATE` trigger (`app.tg_notifications_guard`) that permits only `read_at`/`archived_at` to change, even for the recipient. No cross-workspace or cross-user leak was found; the finding is that this table is **more** restrictive than the pattern, which is why the file's section 6 has its own commentary rather than reusing sections 1-5's assertions verbatim.

No migration, application code or RLS policy is touched. This is a tests + docs PR.

**Acceptance criteria covered:**

| #    | Criterion                                                                               | Covered by                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | A member of workspace A reads zero rows of workspace B, per table                       | `supabase/tests/14_rls_known_gaps.sql`, all 6 tables                                                                                                                                            |
| AC-2 | `anon` holds no `SELECT` privilege on any of the six tables                             | same file, `has_table_privilege('anon', …)` per table                                                                                                                                           |
| AC-3 | A non-owner/admin member sees only what the policy allows                               | same file — nothing at all for `file_access_log`/`email_log`/`subscription_events`/`notifications` outside the caller's own row                                                                 |
| AC-4 | The row's own user sees their own row where the policy has an own-row branch            | same file — `consent_records`, `legal_acceptances`, `notifications`                                                                                                                             |
| AC-5 | Platform admin sees every workspace's rows, where the policy grants that                | same file — true for the first 5; explicitly **false** for `notifications` (asserted, not assumed)                                                                                              |
| AC-6 | Every write the policy does not allow is refused, with `42501` or as zero rows affected | same file — sections 1-5 all `42501`; `notifications` mixes `42501` (protected-column self-edit), zero-rows (cross-user), and a `lives_ok` proving the legitimate self-service path still works |

**Out of scope:** `scripts/check-coverage-test-files.mjs`, `coverage.sql` and the rest of PR #17's M0 wrap-up — already merged, not touched here except for the `KNOWN_GAPS` edit this PR's design explicitly requires.

**Risk areas:** (1) getting each of the first five tables' actual policy shape right from the migration text rather than assumption — confirming `file_access_log`/`email_log`/`subscription_events` have no own-row branch at all; (2) `notifications`' different shape — confirming it has neither an owner/admin nor a platform-admin read branch (so the correct assertion is that even a workspace owner or platform admin sees nothing), and that its guard trigger, not just RLS, is what stops a recipient from rewriting their own notification's content.

---

## 2. Environment

|                |                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------- |
| Commit         | `2afcbf7` — after merging `origin/main` (`53a8393`) and adding the `notifications` coverage |
| Branch         | `test/rls-known-gaps`, merged forward from `origin/main`                                    |
| Base           | `main`                                                                                      |
| CI run         | [36007175542](https://github.com/Mahadezz/acadigma-campus/actions/runs/36007175542)         |
| Preview URL    | n/a — no UI change                                                                          |
| Supabase       | not reachable from this sandbox — no Docker, no local Postgres                              |
| Migration head | unchanged — no migration in this PR                                                         |
| Seed           | `supabase/seed` — unchanged                                                                 |
| Node / pnpm    | v24.x / 10.x                                                                                |
| Browsers       | n/a                                                                                         |
| Feature flags  | none                                                                                        |

---

## 3. Unit and integration (Vitest)

No `apps/`/`packages/` code changed by this PR's own diff (the merge from `origin/main` brought in PR #17's own app/package changes, already tested and merged independently). `pnpm test` (`vitest run --coverage`) was run locally on the post-merge head as part of the pre-push gate: **53 test files, 700 tests, 700 passed, 0 failed.** CI's `unit` job also ran and passed independently (run 36007175542).

---

## 4. Database (pgTAP)

**Not run locally** — no Docker, no local Postgres and no reachable Supabase project in this sandbox. CI's `db` job (fresh Postgres 17 + pgTAP, all migrations applied in order, then `supabase test db`) is the real gate for this PR, and it ran green — see §10.

| Table                 | Isolation assertions                                                                                               | Escalation assertions                                                                                                                                                                     | File                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `consent_records`     | 8 — own-row, cross-tenant, non-owner-in-workspace, owner/admin, platform admin, anon grant                         | 3 — INSERT/UPDATE/DELETE all `42501`                                                                                                                                                      | `supabase/tests/14_rls_known_gaps.sql` |
| `legal_acceptances`   | 8 — own-row, cross-tenant, non-owner-in-workspace, owner/admin, platform admin, anon grant                         | 3 — INSERT/UPDATE/DELETE all `42501`                                                                                                                                                      | `supabase/tests/14_rls_known_gaps.sql` |
| `file_access_log`     | 6 — no own-row branch (subject of the row still sees 0), cross-tenant, owner/admin, platform admin, anon grant     | 3 — INSERT/UPDATE/DELETE all `42501`                                                                                                                                                      | `supabase/tests/14_rls_known_gaps.sql` |
| `email_log`           | 7 — no own-row branch, cross-tenant, owner/admin, platform admin, anon grant                                       | 3 — INSERT/UPDATE/DELETE all `42501`                                                                                                                                                      | `supabase/tests/14_rls_known_gaps.sql` |
| `subscription_events` | 7 — no own-row branch, cross-tenant, owner/admin, platform admin, anon grant                                       | 3 — INSERT/UPDATE/DELETE all `42501`                                                                                                                                                      | `supabase/tests/14_rls_known_gaps.sql` |
| `notifications`       | 6 — own-row, cross-tenant, no admin bypass, no platform-admin bypass, anon grant (recipient-only, no other branch) | 7 — INSERT `42501` (no grant); cross-user UPDATE/DELETE affect zero rows (2 tests each, incl. verification); own-row protected-column UPDATE `42501`; own-row `read_at` UPDATE `lives_ok` | `supabase/tests/14_rls_known_gaps.sql` |

64 assertions total (`plan(64)`), one file, self-contained fixtures (`tests.mkuser`/`login`/`logout` duplicated per house style), everything inside `begin`/`rollback`.

**CI result (pg_prove):** PASS — see §10 for the real output, run [36007175542](https://github.com/Mahadezz/acadigma-campus/actions/runs/36007175542).

**Specifically proven:**

- A member of workspace A reads zero rows of every one of the six tables scoped to workspace B.
- `anon` has no `SELECT` privilege at all on any of the six — not merely an empty result set.
- `file_access_log`'s subject-of-the-row user cannot read the very access-log entry about their own download; only `has_role(owner, admin)` or a platform admin can.
- `consent_records`/`legal_acceptances` each grant their own-row branch independently of workspace role.
- `subscription_events` is tighter than `usage_counters`: a non-owner/admin member cannot read their own school's billing timeline, even though every member can read its usage counters.
- Sections 1-5 refuse authenticated `INSERT`/`UPDATE`/`DELETE` with `42501` — none of the five grants a write verb at all.
- **`notifications` is the outlier, and more restrictive than the pattern, not less:** its `SELECT` policy has no owner/admin or platform-admin branch at all — a workspace owner and even a platform admin both read **zero** rows of another user's notification, even inside the same workspace. It does carry real `UPDATE`/`DELETE` grants, but RLS scopes both to the caller's own row (a cross-user attempt affects zero rows, verified unchanged afterward), and a `BEFORE UPDATE` guard trigger refuses to let even the recipient change anything but `read_at`/`archived_at` — while the legitimate self-service path (marking a notification read) is proven to still work (`lives_ok`).

---

## 5. End to end (Playwright)

Not applicable — no UI or route changed by this PR's own diff (PR #17's nav-unification UI changes arrived via the merge and were already tested and merged independently).

---

## 6. Performance

Not applicable — no new query added to an application code path; these are pgTAP-only assertions run in CI's ephemeral Postgres.

---

## 7. Security checks

| Check                           | Result                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------- |
| gitleaks / secret scan          | PASS — CI `security` job, run 36007175542                                       |
| Semgrep                         | PASS — 150 rules, 489 files, 0 findings (CI `security` job, run 36007175542)    |
| `pnpm audit --audit-level high` | PASS — `scripts/audit-with-exceptions.mjs`: "Audit clean — 0 active exceptions" |
| Dependency review (GitHub)      | FAIL — repo setting, not code; see §10                                          |
| Supabase advisors               | not applicable — no reachable project, no schema change                         |
| Authorized DAST                 | not applicable — no new endpoint or UI surface                                  |

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                        | Severity          | Ship anyway?                                                                                                                                                                                           | Tracked |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | `notifications`' assertions were written from the migration text and reviewed by eye before ever running — resolved: CI's `db` job ran them for real, all 64 assertions passed (§4, §10)                                                                                                                                                                                                                     | ~~high~~ resolved | —                                                                                                                                                                                                      | —       |
| 2   | CI's `security` job's "Dependency review" sub-step fails: "Dependency review is not supported on this repository... ensure Dependency graph is enabled". The repo just went public and this step (gated on `!private`) is running for the first time; it needs "Dependency graph" turned on under Settings → Code security and analysis — a one-time repo setting, anticipated by the workflow's own comment | low               | yes — Semgrep, gitleaks and `pnpm audit` all pass within the same job; only the GitHub-hosted dependency-review integration is blocked by this setting, and it is not something this PR's code can fix | —       |

**Deliberately not tested, and why:**

- Realtime delivery of `notifications` (the `supabase_realtime` publication add in the migration) — out of scope for an RLS isolation/escalation test; that's an application/transport concern, not a row-visibility one.

---

## 9. Sign-off

| Definition of Done                           | Met                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Spec written and matches the build           | ☑ (ARCHITECTURE §9, D-56)                                                         |
| Migration + pgTAP isolation and escalation   | ☑ written / ☑ executed — CI `db` job, PASS, 64/64 (§4, §10)                       |
| Unit tests + coverage thresholds             | n/a — no application code changed by this PR's own diff (700/700 local, CI green) |
| UI built and verified at both viewports      | ☐ n/a — no UI change                                                              |
| Playwright journey at both viewports         | ☐ n/a — no new journey; CI `e2e` job unaffected and green                         |
| a11y — zero serious/critical + manual checks | ☐ n/a — no UI change                                                              |
| This test report, with real numbers          | ☑ (§4, §10 — real `pg_prove` output pasted)                                       |
| Docs updated in the same PR                  | ☑ (`docs/README.md`, `supabase/tests/README.md`, this report)                     |

**Signed off by:** Claude (Sonnet 5, builder session)
**Date:** 2026-09-24
**Commit:** `2afcbf7`

> This PR adds tests and docs only — no migration, no application code. `supabase/tests/14_rls_known_gaps.sql` was written from the actual policy and trigger text in `supabase/migrations/20260917010200_audit_and_files.sql` and `20260917010300_plans_and_notifications.sql`, not from assumption, and reviewed by eye against the house style in `02_tenant_isolation.sql`/`03_role_escalation.sql`/`11_tenancy_tripwire_status.sql` before ever running. The `notifications` section surfaced a real difference from the other five (no owner/admin or platform-admin read branch at all) — this is a **more** restrictive policy than the pattern, confirmed by assertion against a real Postgres, not a leak. CI's `db` job is the required, real gate, and it has now run: PASS, 64/64 assertions, no defect found. See §10.

---

## 10. Addendum — CI results, 2026-09-24

**Repo went public; GitHub Actions billing/spending-limit block from the earlier run is gone.** CI on head `2afcbf7` (PR #18), run [36007175542](https://github.com/Mahadezz/acadigma-campus/actions/runs/36007175542): `build`, `changeset`, `contracts`, `db`, `docs-sync`, `lighthouse`, `lint`, `report`, `sql-lint`, `typecheck`, `unit`, `e2e` all **PASS**. The `db` job's real `pg_prove` output:

```
supabase/tests/14_rls_known_gaps.sql ............. ok
All tests successful.
Files=14, Tests=341,  1 wallclock secs
Result: PASS
```

`14_rls_known_gaps.sql` reported `1..64` and `ok` — all 64 assertions passed, including the 13 new `notifications` assertions. **No RLS gap, leak or unexpected grant found anywhere, including `notifications`**: its read policy is confirmed to have no owner/admin or platform-admin branch at all (a workspace owner and a platform admin both read zero rows of another user's notification), its write grants are confirmed scoped to the caller's own row by RLS, and its guard trigger is confirmed to block even the recipient from changing anything but `read_at`/`archived_at` — while the legitimate self-service path (marking read) is confirmed to still work. This is a stricter table than the pattern, not a weaker one; nothing here needed a STOP.

`node scripts/check-coverage-test-files.mjs` (run locally against this head): `Coverage OK — 16 workspace_id tables; 16 named in a supabase/tests/*.sql file, 0 tracked in KNOWN_GAPS.` — the allowlist is empty, as designed.

**One check fails, unrelated to this PR's code:** `security`'s "Dependency review" sub-step errors with _"Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled along with GitHub Advanced Security on private repositories."_ The workflow's own comment anticipated exactly this (`.github/workflows/ci.yml` line ~388: "Needs Dependency graph + Advanced Security, unavailable on private repos without GHAS... this re-enables itself if the repo goes public") — the step is gated on `github.event.repository.private == false` and only started running now that the repo is public; it still needs "Dependency graph" turned on by hand under Settings → Code security and analysis. Semgrep (0 findings), gitleaks and the dependency audit (`pnpm audit` via `scripts/audit-with-exceptions.mjs`, clean) all pass within the same job — only the GitHub-hosted dependency-review integration itself is blocked by that repo setting. This is a one-time repository configuration step, not a code change, and not something this PR introduced.
