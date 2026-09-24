# Test Report — Bug fix: billing bootstrap no longer trips the tenant guard (D-59)

|         |                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Feature | Cross-cutting bug fix (not a numbered feature) — `app.tg_workspace_billing_bootstrap()` vs. `app.tg_workspaces_guard()` |
| Part    | Single Part: split the bootstrap trigger + pgTAP proof                                                                  |
| Spec    | `docs/decisions/DECISION-LOG.md` D-59; closes Known issue #3 of `docs/test-reports/2026-09-24-F-ID-05-p1.md`            |
| PR      | [#23](https://github.com/Mahadezz/acadigma-campus/pull/23)                                                              |
| Status  | **PASS WITH KNOWN ISSUES**                                                                                              |
| Date    | 2026-09-24                                                                                                              |
| Run by  | Claude (Sonnet 5, builder session)                                                                                      |

---

## 1. Scope

**What this Part is.** Confirmed pre-existing bug, found by PR #19's reviews: `app.tg_workspace_billing_bootstrap()` (AFTER INSERT, `SECURITY DEFINER`) set `workspaces.plan_id`/`.trial_ends_at` with a nested `UPDATE` against the row it had just inserted, which tripped `app.tg_workspaces_guard()`'s plan/trial check for ANY workspace INSERT made as `authenticated` — `app.is_privileged_context()` reads the `role` GUC (unaffected by `SECURITY DEFINER` nesting), so it cannot tell the platform's own nested UPDATE from an ordinary client UPDATE. A school created from the app would have failed outright; F-ID-05 Part 4's planned `app.create_school_workspace()` would have hit it on day one. This Part fixes it by splitting the bootstrap into a BEFORE INSERT trigger (`app.tg_workspace_billing_defaults()`, sets `NEW.plan_id`/`NEW.trial_ends_at` directly, no `UPDATE`) and a narrowed AFTER INSERT trigger (only the school `subscriptions`/`subscription_events` rows, which genuinely need the row to exist as an FK reference) — see D-59 for the full option analysis (why not the guard-exception or set_config-flag alternatives).

**Acceptance criteria covered** (this Part is a bug fix, not a spec'd feature — criteria are the task's own):

| #   | Criterion                                                                                                                                                                                   | Covered by                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An authenticated owner's school-workspace INSERT succeeds end to end (owner membership, plan_id, trial_ends_at, subscriptions, subscription_events)                                         | `supabase/tests/16_billing_bootstrap_guard.sql` test 1 (7 assertions)                                                                                       |
| 2   | A client's direct UPDATE of `plan_id`/`trial_ends_at`/`access_mode` on their own workspace is still refused, `42501`, same message                                                          | `supabase/tests/16_billing_bootstrap_guard.sql` test 2 (4 assertions)                                                                                       |
| 3   | The personal-workspace signup path (`auth.users` insert → `app.handle_new_user()`) still works, `plan_id` set to `personal_free`                                                            | `supabase/tests/16_billing_bootstrap_guard.sql` test 3 (2 assertions), plus `15_personal_workspace_registration.sql`'s existing signup coverage (unchanged) |
| 4   | Hardening (Opus review): a caller-supplied plan_id (a paid, non-pro plan) and a decade-long trial_ends_at on the INSERT itself are both overwritten by the bootstrap, not merely left alone | `supabase/tests/16_billing_bootstrap_guard.sql` test 4 (4 assertions)                                                                                       |
| 5   | A missing plan catalogue row (bootstrap misconfiguration) fails the INSERT loudly with `22023`, instead of silently leaving `plan_id` null or a client-supplied value in place              | `supabase/tests/16_billing_bootstrap_guard.sql` test 5 (3 assertions, under a savepoint as `postgres`)                                                      |
| 6   | Existing suites stay green, updated where they encoded the now-fixed bug's failure mode                                                                                                     | `15_personal_workspace_registration.sql` test 7 changed from `throws_ok` (42501) to `lives_ok` — see §4a                                                    |

**Out of scope for this Part:** `app.transfer_ownership()` has the identical shape (a nested `UPDATE public.workspaces SET owner_id = ...` inside a `SECURITY DEFINER` function callable by a plain owner) and is latent-broken for the same `role`-GUC reason the moment it is called as `authenticated` — but it has no `public` wrapper yet (D-50) and no test exercises it as `authenticated` today, so nothing is confirmed-broken in production. Recorded in D-59's consequences and as Known issue #1 below, not fixed here — fixing it is a second, separate PR against a function this task did not name.

**Risk areas:** getting the BEFORE-INSERT-vs-AFTER-INSERT split right without changing any client-visible end state (same `plan_id`, same `trial_ends_at`, same `subscriptions`/`subscription_events` rows as before); not accidentally loosening `app.tg_workspaces_guard()` itself, which this PR does not touch at all — proven by test 2's three direct-UPDATE-still-refused assertions, pinned to the exact pre-existing message; and (Opus review addition) not leaving a window where a client-supplied `plan_id`/`trial_ends_at` on the INSERT statement itself could survive a missing-catalogue-row edge case — proven by tests 4 and 5.

---

## 2. Environment

|                |                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit         | `3d53fb2` (`fix/billing-bootstrap-vs-workspace-guard`)                                                                                                        |
| Branch         | `fix/billing-bootstrap-vs-workspace-guard`                                                                                                                    |
| PR             | [#23](https://github.com/Mahadezz/acadigma-campus/pull/23)                                                                                                    |
| CI run         | [Actions run 36019411182](https://github.com/Mahadezz/acadigma-campus/actions/runs/36019411182) (`ci.yml`, head commit `3d53fb2`)                             |
| Preview URL    | not applicable (no app code changed)                                                                                                                          |
| Supabase       | project `kekfmibwjejdhxjkmezo`, branch `dev` — not mutated from this session; CI runs against a disposable Postgres container                                 |
| Migration head | `20260925000200_billing_bootstrap_vs_workspace_guard.sql`                                                                                                     |
| Seed           | `supabase/seed` (unchanged by this PR)                                                                                                                        |
| Node / pnpm    | v24.x / 10.x                                                                                                                                                  |
| Docker         | **unavailable in this session** — pgTAP was authored and reasoned through carefully, but only executed in CI (job `db`, run above), per this task's hard rule |

---

## 3. Unit and integration (Vitest)

Not applicable to what changed — this Part touches only `supabase/**` and docs, no `apps/` or `packages/` code. `pnpm test` was still run in full to confirm nothing broke:

| Suite                               | Tests | Passed | Failed | Skipped | Duration |
| ----------------------------------- | ----- | ------ | ------ | ------- | -------- |
| Full repo (`vitest run --coverage`) | 700   | 700    | 0      | 0       | 9.29 s   |

Coverage unchanged from `main` (no source touched by this PR): Statements 92.45 %, Branches 83.13 %, Functions 92.07 %, Lines 94.08 % — all above the repository-overall 70 % threshold.

---

## 4. Database (pgTAP)

**Docker is unavailable locally; every pgTAP number below is copied from the real CI `db` job run for this PR's head commit** ([run 36019411182](https://github.com/Mahadezz/acadigma-campus/actions/runs/36019411182), job `db`), not fabricated.

| File                                     | What it proves                                                                                                                         | Result                                                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `16_billing_bootstrap_guard.sql` (new)   | 20 assertions across 5 sections — see §1's acceptance-criteria table                                                                   | **PASS** — `ok 1`–`ok 20`, all green                                                                                                                                                                                   |
| `15_personal_workspace_registration.sql` | Section 7 changed `throws_ok('42501', …)` → `lives_ok(…)` (the school-type insert now succeeds end to end); plan count unchanged at 18 | **PASS** — `ok 18 - a school-type insert PASSES the workspaces_insert RLS policy and now succeeds end to end (D-59 fixed the pre-existing app.tg_workspace_billing_bootstrap()/app.tg_workspaces_guard() interaction)` |
| Every other file (`01`–`14`)             | Untouched by this PR's migration; not regressed (see §4a for the one file whose fixture path this migration touches)                   | **PASS**                                                                                                                                                                                                               |

### 4a. Why `07_plans_limits.sql` was checked, and stays green

`07_plans_limits.sql` inserts a school workspace directly as the `postgres` role (no `tests.login()` call before it), which fires `app.tg_workspace_billing_bootstrap()` as before. Since `is_privileged_context()` was already `true` for a plain `postgres`-role session before this PR (unaffected by the `role`-GUC read either way), that insert never tripped the guard, and this PR's split produces the identical end state (same `plan_id`, `trial_ends_at`, `subscriptions` row) through the BEFORE/AFTER INSERT trigger pair instead of a single AFTER INSERT trigger with a nested UPDATE — the test only asserts the end state, not the trigger internals, so it is unaffected. Confirmed by CI: no assertion in `07_plans_limits.sql` regressed.

### 4b. Full suite — actual CI result

```
Files=16, Tests=380,  2 wallclock secs ( 0.06 usr  0.03 sys +  0.34 cusr  0.13 csys =  0.56 CPU)
Result: PASS
```

All 16 test files (`01`–`16`), 380 assertions, zero failures — CI run [36019411182](https://github.com/Mahadezz/acadigma-campus/actions/runs/36019411182), job `db` (this PR's head commit, `3d53fb2`). `16_billing_bootstrap_guard.sql`'s own 20 assertions (`ok 1`–`ok 20`) are individually confirmed green in the raw log, not just inferred from the aggregate count.

---

## 5. End to end (Playwright)

Not applicable — no UI, route or client-visible behaviour changed. No `apps/create-school`-style page exists yet to exercise `type='school'` inserts from the browser (that is F-ID-05 Part 4, not yet built); this fix removes a blocker for that Part rather than shipping any UI itself.

---

## 6. Performance

Not applicable — trigger logic only, no new query pattern added to a hot path. The BEFORE INSERT trigger reads `public.plans` by `code` (already indexed, `plans_code_key`), same as the AFTER INSERT trigger it replaces did.

---

## 7. Security checks

| Check                                                                 | Result                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gitleaks / Semgrep (ERROR severity) / `pnpm audit --audit-level high` | CI `security` job **PASS** (run [36019411182](https://github.com/Mahadezz/acadigma-campus/actions/runs/36019411182)); `Semgrep OSS` check **PASS** separately                                                                                     |
| Supabase advisors — new security advisories                           | not run — no Supabase project mutation from this session; every change narrows nothing a client could already do (the guard itself is untouched) and widens nothing — see D-59's "Why not option a/c"                                             |
| Authorized DAST against preview                                       | not applicable — no UI/route changed                                                                                                                                                                                                              |
| Does this loosen `app.tg_workspaces_guard()` for a client?            | **No.** The guard function's body is not modified by this PR at all. `16_billing_bootstrap_guard.sql` test 2 proves a client's direct UPDATE of `plan_id`/`trial_ends_at`/`access_mode` still raises `42501` with the exact pre-existing message. |

**If DAST was run** — not applicable.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                          | Severity                    | Ship anyway?                                                                                                                                                                                                                    | Tracked                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | **Same class of bug found by this PR's investigation, not fixed here:** `app.transfer_ownership()` (`20260917010100_identity.sql:785-819`) does a nested `UPDATE public.workspaces SET owner_id = ...` inside a `SECURITY DEFINER` function callable by a plain `owner` — the identical `role`-GUC shape D-59 fixes for billing, on the `owner_id` immutability check instead. | medium                      | yes — no `public` wrapper exists for it yet (D-50) and no test exercises it as `authenticated`, so this is latent, not confirmed-broken-in-production; recorded in D-59's consequences for whoever wires up ownership transfer. | `docs/decisions/DECISION-LOG.md` D-59 consequences |
| 2   | pgTAP was authored and reasoned through carefully but never ran on this laptop (no Docker) — CI is the only place any of it has executed.                                                                                                                                                                                                                                      | medium → **resolved by CI** | yes — resolved: `gh pr checks 23` is fully green, `db` job `Files=16, Tests=380, Result: PASS` (see §4b)                                                                                                                        | this report                                        |

**CI job results (this PR, run [36019411182](https://github.com/Mahadezz/acadigma-campus/actions/runs/36019411182), head commit `3d53fb2`):**

| Job (required unless noted)                    | Result | Notes                                               |
| ---------------------------------------------- | ------ | --------------------------------------------------- |
| `lint`                                         | PASS   |                                                     |
| `typecheck`                                    | PASS   |                                                     |
| `db`                                           | PASS   | `Files=16, Tests=380, Result: PASS` — see §4        |
| `unit`                                         | PASS   | 700/700 Vitest tests                                |
| `contracts`                                    | PASS   |                                                     |
| `build`                                        | PASS   |                                                     |
| `security`                                     | PASS   |                                                     |
| `e2e`                                          | PASS   |                                                     |
| `lighthouse`                                   | PASS   |                                                     |
| `changeset`                                    | PASS   | no changeset needed — no `apps/`/`packages/` change |
| `docs-sync`                                    | PASS   |                                                     |
| `sql-lint` (not required, `continue-on-error`) | PASS   |                                                     |
| `Semgrep OSS`                                  | PASS   |                                                     |

**Every check is green** (`gh pr checks 23` exit 0, no pending/failing checks remaining).

**Deliberately not tested, and why:**

- UI, e2e, a11y, performance: no code in this Part exercises any of them.
- `coverage.sql` repo-wide RLS/grant invariant: unaffected — this PR adds no new `workspace_id` table.
- Live Supabase project re-verification: not mutated from this session; the fix's correctness is proven by CI's pgTAP suite.

---

## 9. Sign-off

| Definition of Done                           | Met                                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec written and matches the build           | ☒ (DECISION-LOG D-59 stands in for a feature spec on this bug fix)                                                                                                |
| Migration + pgTAP isolation and escalation   | ☒ (guard-vs-bootstrap interaction, not tenant isolation — not applicable in that form here)                                                                       |
| Unit tests + coverage thresholds             | ☒ (no app code touched; full `pnpm test` run, 700/700 passing)                                                                                                    |
| UI built and verified at both viewports      | n/a — no UI in this Part                                                                                                                                          |
| Playwright journey at both viewports         | n/a — no UI in this Part                                                                                                                                          |
| a11y — zero serious/critical + manual checks | n/a — no UI in this Part                                                                                                                                          |
| This test report, with real numbers          | ☒ for local checks (format/typecheck/lint/test/check-*.mjs, all run and green); pgTAP is CI-only, honestly marked as such                                         |
| Docs updated in the same PR                  | ☒ (`DATA-MODEL.md`, `DECISION-LOG.md` D-59, `supabase/tests/README.md`, `docs/README.md`, this report, `2026-09-24-F-ID-05-p1.md` Known issue #3 marked resolved) |

**Signed off by:** Claude (Sonnet 5), builder session
**Date:** 2026-09-24
**Commit:** `3d53fb2` (PR [#23](https://github.com/Mahadezz/acadigma-campus/pull/23))

> I wrote and reasoned through every assertion in `16_billing_bootstrap_guard.sql` (including the two sections added on Opus review) and the change to `15_personal_workspace_registration.sql` test 7 myself; I did not fabricate a pass. This laptop has no Docker, so pgTAP has not executed anywhere but CI — the §4 numbers are copied from the real CI `db` job run for this PR's head commit (run 36019411182), not invented. `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (700/700) and every `node scripts/check-*.mjs` were run locally and are genuinely green, not assumed. Every CI check on the PR is green.
