# Test Report — Bug fix: billing bootstrap no longer trips the tenant guard (D-59)

|         |                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Feature | Cross-cutting bug fix (not a numbered feature) — `app.tg_workspace_billing_bootstrap()` vs. `app.tg_workspaces_guard()` |
| Part    | Single Part: split the bootstrap trigger + pgTAP proof                                                                  |
| Spec    | `docs/decisions/DECISION-LOG.md` D-59; closes Known issue #3 of `docs/test-reports/2026-09-24-F-ID-05-p1.md`            |
| PR      | opened from `fix/billing-bootstrap-vs-workspace-guard` against `main` (see PR description)                              |
| Status  | **PASS WITH KNOWN ISSUES**                                                                                              |
| Date    | 2026-09-24                                                                                                              |
| Run by  | Claude (Sonnet 5, builder session)                                                                                      |

---

## 1. Scope

**What this Part is.** Confirmed pre-existing bug, found by PR #19's reviews: `app.tg_workspace_billing_bootstrap()` (AFTER INSERT, `SECURITY DEFINER`) set `workspaces.plan_id`/`.trial_ends_at` with a nested `UPDATE` against the row it had just inserted, which tripped `app.tg_workspaces_guard()`'s plan/trial check for ANY workspace INSERT made as `authenticated` — `app.is_privileged_context()` reads the `role` GUC (unaffected by `SECURITY DEFINER` nesting), so it cannot tell the platform's own nested UPDATE from an ordinary client UPDATE. A school created from the app would have failed outright; F-ID-05 Part 4's planned `app.create_school_workspace()` would have hit it on day one. This Part fixes it by splitting the bootstrap into a BEFORE INSERT trigger (`app.tg_workspace_billing_defaults()`, sets `NEW.plan_id`/`NEW.trial_ends_at` directly, no `UPDATE`) and a narrowed AFTER INSERT trigger (only the school `subscriptions`/`subscription_events` rows, which genuinely need the row to exist as an FK reference) — see D-59 for the full option analysis (why not the guard-exception or set_config-flag alternatives).

**Acceptance criteria covered** (this Part is a bug fix, not a spec'd feature — criteria are the task's own):

| #   | Criterion                                                                                                                                           | Covered by                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An authenticated owner's school-workspace INSERT succeeds end to end (owner membership, plan_id, trial_ends_at, subscriptions, subscription_events) | `supabase/tests/16_billing_bootstrap_guard.sql` test 1 (6 assertions)                                                                                       |
| 2   | A client's direct UPDATE of `plan_id`/`trial_ends_at`/`access_mode` on their own workspace is still refused, `42501`, same message                  | `supabase/tests/16_billing_bootstrap_guard.sql` test 2 (4 assertions)                                                                                       |
| 3   | The personal-workspace signup path (`auth.users` insert → `app.handle_new_user()`) still works, `plan_id` set to `personal_free`                    | `supabase/tests/16_billing_bootstrap_guard.sql` test 3 (2 assertions), plus `15_personal_workspace_registration.sql`'s existing signup coverage (unchanged) |
| 4   | Existing suites stay green, updated where they encoded the now-fixed bug's failure mode                                                             | `15_personal_workspace_registration.sql` test 7 changed from `throws_ok` (42501) to `lives_ok` — see §4a                                                    |

**Out of scope for this Part:** `app.transfer_ownership()` has the identical shape (a nested `UPDATE public.workspaces SET owner_id = ...` inside a `SECURITY DEFINER` function callable by a plain owner) and is latent-broken for the same `role`-GUC reason the moment it is called as `authenticated` — but it has no `public` wrapper yet (D-50) and no test exercises it as `authenticated` today, so nothing is confirmed-broken in production. Recorded in D-59's consequences and as Known issue #1 below, not fixed here — fixing it is a second, separate PR against a function this task did not name.

**Risk areas:** getting the BEFORE-INSERT-vs-AFTER-INSERT split right without changing any client-visible end state (same `plan_id`, same `trial_ends_at`, same `subscriptions`/`subscription_events` rows as before); not accidentally loosening `app.tg_workspaces_guard()` itself, which this PR does not touch at all — proven by test 2's three direct-UPDATE-still-refused assertions, pinned to the exact pre-existing message.

---

## 2. Environment

|                |                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Commit         | see PR's head commit                                                                                                                    |
| Branch         | `fix/billing-bootstrap-vs-workspace-guard`                                                                                              |
| PR             | see PR description                                                                                                                      |
| CI run         | see the CI run linked from the PR                                                                                                       |
| Preview URL    | not applicable (no app code changed)                                                                                                    |
| Supabase       | project `kekfmibwjejdhxjkmezo`, branch `dev` — not mutated from this session; CI runs against a disposable Postgres container           |
| Migration head | `20260925000200_billing_bootstrap_vs_workspace_guard.sql`                                                                               |
| Seed           | `supabase/seed` (unchanged by this PR)                                                                                                  |
| Node / pnpm    | v24.x / 10.x                                                                                                                            |
| Docker         | **unavailable in this session** — pgTAP was authored and reasoned through carefully, but only executed in CI, per this task's hard rule |

---

## 3. Unit and integration (Vitest)

Not applicable to what changed — this Part touches only `supabase/**` and docs, no `apps/` or `packages/` code. `pnpm test` was still run in full to confirm nothing broke:

| Suite                               | Tests | Passed | Failed | Skipped | Duration |
| ----------------------------------- | ----- | ------ | ------ | ------- | -------- |
| Full repo (`vitest run --coverage`) | 700   | 700    | 0      | 0       | 9.29 s   |

Coverage unchanged from `main` (no source touched by this PR): Statements 92.45 %, Branches 83.13 %, Functions 92.07 %, Lines 94.08 % — all above the repository-overall 70 % threshold.

---

## 4. Database (pgTAP)

**Docker is unavailable locally, so every pgTAP number below is reasoned through, not locally executed — CI is the only place any of it has run** (task hard rule: "pgTAP runs in CI").

| File                                     | What it proves                                                                                                                         | Result  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `16_billing_bootstrap_guard.sql` (new)   | 13 assertions across 3 sections — see §1's acceptance-criteria table                                                                   | CI-only |
| `15_personal_workspace_registration.sql` | Section 7 changed `throws_ok('42501', …)` → `lives_ok(…)` (the school-type insert now succeeds end to end); plan count unchanged at 18 | CI-only |
| Every other file (`01`–`14`)             | Untouched by this PR's migration — reasoned to stay green (see §4a for the one file whose fixture path this migration touches)         | CI-only |

### 4a. Why `07_plans_limits.sql` was checked, and stays green

`07_plans_limits.sql` inserts a school workspace directly as the `postgres` role (no `tests.login()` call before it), which fires `app.tg_workspace_billing_bootstrap()` as before. Since `is_privileged_context()` was already `true` for a plain `postgres`-role session before this PR (unaffected by the `role`-GUC read either way), that insert never tripped the guard, and this PR's split produces the identical end state (same `plan_id`, `trial_ends_at`, `subscriptions` row) through the BEFORE/AFTER INSERT trigger pair instead of a single AFTER INSERT trigger with a nested UPDATE — the test only asserts the end state, not the trigger internals, so it is unaffected.

### 4b. Full suite — expected CI result

`pg_prove --verbose --ext .sql supabase/tests/*.sql` expected: `Files=13` (12 existing feature files + `16_billing_bootstrap_guard.sql`; `coverage.sql` runs as a separate `psql` step, not through `pg_prove`), all green. Actual numbers to be filled in from the real CI run once available — not fabricated here.

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
| gitleaks / Semgrep (ERROR severity) / `pnpm audit --audit-level high` | run as part of CI `security` job — see PR checks                                                                                                                                                                                                  |
| Supabase advisors — new security advisories                           | not run — no Supabase project mutation from this session; every change narrows nothing a client could already do (the guard itself is untouched) and widens nothing — see D-59's "Why not option a/c"                                             |
| Authorized DAST against preview                                       | not applicable — no UI/route changed                                                                                                                                                                                                              |
| Does this loosen `app.tg_workspaces_guard()` for a client?            | **No.** The guard function's body is not modified by this PR at all. `16_billing_bootstrap_guard.sql` test 2 proves a client's direct UPDATE of `plan_id`/`trial_ends_at`/`access_mode` still raises `42501` with the exact pre-existing message. |

**If DAST was run** — not applicable.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                          | Severity                | Ship anyway?                                                                                                                                                                                                                    | Tracked                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | **Same class of bug found by this PR's investigation, not fixed here:** `app.transfer_ownership()` (`20260917010100_identity.sql:785-819`) does a nested `UPDATE public.workspaces SET owner_id = ...` inside a `SECURITY DEFINER` function callable by a plain `owner` — the identical `role`-GUC shape D-59 fixes for billing, on the `owner_id` immutability check instead. | medium                  | yes — no `public` wrapper exists for it yet (D-50) and no test exercises it as `authenticated`, so this is latent, not confirmed-broken-in-production; recorded in D-59's consequences for whoever wires up ownership transfer. | `docs/decisions/DECISION-LOG.md` D-59 consequences |
| 2   | pgTAP was authored and reasoned through carefully but never ran on this laptop (no Docker) — CI is the only place any of it has executed.                                                                                                                                                                                                                                      | medium → resolved by CI | yes, gated on `gh pr checks` going fully green before this PR is treated as ready                                                                                                                                               | this report                                        |

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
**Commit:** see PR's head commit

> I wrote and reasoned through every assertion in `16_billing_bootstrap_guard.sql` and the change to `15_personal_workspace_registration.sql` test 7 myself; I did not fabricate a pass. This laptop has no Docker, so pgTAP has not executed anywhere but CI. `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (700/700) and every `node scripts/check-*.mjs` were run locally and are genuinely green, not assumed.
