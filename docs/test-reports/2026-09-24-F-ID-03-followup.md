# Test Report — F-ID-03 Workspaces & Membership, Review Follow-ups

|         |                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------- |
| Feature | F-ID-03 — Workspaces, membership and tenancy                                                   |
| Part    | Follow-up to Parts 1-3 — fixes from the Opus review of merged PR #7                            |
| Spec    | `docs/features/01-identity/F-ID-03-workspaces-and-membership.md` §4.3, §11 "Review follow-ups" |
| PR      | opened from `fix/tenancy-review-followups` against `main` (see PR description for the link)    |
| Status  | **PASS WITH KNOWN ISSUES**                                                                     |
| Date    | 2026-09-24                                                                                     |
| Run by  | Claude (Sonnet 5, builder session)                                                             |

---

## 1. Scope

**What this Part is.** Three findings from an Opus review of the already-merged F-ID-03 Parts 1-3 PR (#7), fixed as one follow-up:

1. **Stale workspace cookie on a shared device.** `acadigma_workspace` lived a year and was only cleared by explicit sign-out. On a shared phone, if session A expired without sign-out and person B then signed in, B's request still carried A's workspace id — `resolveWorkspaceContext` wrote a false `tenancy.context_rejected` "forgery" row into A's school and stranded B on `/onboarding`. Fixed by clearing the cookie on every path that mints a session (`signInWithPassword`, `resetPassword`'s `verifyOtp`, `/api/auth/callback`'s `verifyOtp`), and by making `resolveLandingRoute` resolve workspace context with an empty header bag rather than the request's real headers (middleware has already mirrored the stale cookie into `x-workspace-id` for the request in flight, so clearing the response cookie alone cannot fix the current request).
2. **Removed/pending member indistinguishable from a forger.** `resolveWorkspaceContext`'s header path fired the `tenancy.context_rejected` tripwire for ANY non-active-membership header, conflating a genuine forged header with a removed or pending member replaying a stale one. Fixed with a second, narrower query (only run when the active check comes back empty): does the caller have any `workspace_members` row for the workspace, in any status. A row found fails a new `membership_inactive` reason without the tripwire; no row fails `not_a_member` with the tripwire, exactly as before. AC6 is unaffected — `requireWorkspace()` already renders the same forbidden screen for any non-`unauthenticated` reason.
3. **Tenant-freeze trigger vs. a legitimate cascade.** `data_requests.workspace_id` is `on delete set null` (a DSAR outlives the school it names), but the freeze trigger F-ID-03 Part 1 attached to that table treats `ON DELETE SET NULL`'s internal UPDATE the same as a client re-parent attempt and aborts it. Fixed with a narrow exception in `app.tg_freeze_workspace()`: allow exactly the `not null → null` transition, only on `data_requests`, only when `pg_trigger_depth() > 1` (the FK cascade's own signature).

Also corrected: the 2026-09-17 F-ID-03 Parts 1-3 test report's known-issue row 1 still said e2e was "not skippable"; it now reflects the `E2E_LIVE_SUPABASE` skip guard pending OQ-26/OQ-27.

**Acceptance criteria covered / affected** (from spec §9 and §4.3's failure cases):

| #                                    | Criterion                                                                                | Covered by                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §4.3 failure case (forged header)    | Well-formed header, no row at all → 403 `not_a_member` + tripwire                        | `packages/db/src/workspace-context.test.ts` "still fails not_a_member and fires the tripwire exactly once"                                                                                                                          |
| §4.3 failure case (new, this Part)   | Well-formed header, removed/pending row → 403 `membership_inactive`, no tripwire         | `workspace-context.test.ts` "removed/pending member vs. a genuine forger" describe block                                                                                                                                            |
| AC-6                                 | Removed member sees the no-longer-have-access screen, no row from S served               | Unchanged — `requireWorkspace()` renders `forbidden()` for both `not_a_member` and `membership_inactive`; DB-level proof remains `09_tenancy.sql` attack path 4 (CI only, see §4)                                                   |
| Shared-phone scenario (this Part)    | A new sign-in never inherits a stale workspace cookie                                    | `apps/web/app/(auth)/actions.test.ts` "signInWithPassword (F-ID-03 review...)" and the `resetPassword` cookie-clear test; `apps/web/lib/resolve-landing-route.test.ts` "always resolves workspace context with an empty header bag" |
| Cascade freeze exception (this Part) | Deleting a workspace with a `data_requests` row succeeds; direct re-parent still blocked | `supabase/tests/10_tenancy_cascade.sql` (CI only, see §4)                                                                                                                                                                           |

**Out of scope for this Part:** everything else in F-ID-03 Parts 4-8 (switcher UI, roster, role/label CRUD, removal/transfer, module visibility) — untouched by this follow-up.

**Risk areas** — where the effort went: (1) getting the `pg_trigger_depth()` cascade-detection condition right, since it cannot be exercised without a real Postgres (no Docker in this environment — CI's `db` job is the actual proof); (2) making sure the `membership_inactive` change does not weaken AC6 — traced `requireWorkspace()`'s error-code branching to confirm it renders the same forbidden screen regardless of reason; (3) the header-vs-cookie timing: confirming that clearing the response cookie alone does not fix the request in flight, and that `resolveLandingRoute` needed its own fix independent of the cookie clear.

---

## 2. Environment

|                |                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| Commit         | HEAD of `fix/tenancy-review-followups` at PR open time (see PR for the exact sha)          |
| Branch         | `fix/tenancy-review-followups`                                                             |
| Base           | `main` @ `7e774ce` (PR #7, merged)                                                         |
| CI run         | see PR checks                                                                              |
| Preview URL    | n/a — no UI change in this Part                                                            |
| Supabase       | project `bvqzhrvcrxebawjusrxk`, branch `dev` (not reachable from this sandbox — see §4/§5) |
| Migration head | `20260924010000_tenancy_freeze_cascade_exception.sql`                                      |
| Seed           | `supabase/seed` — unchanged                                                                |
| Node / pnpm    | v24.x / 10.34.5                                                                            |
| Browsers       | n/a — no e2e change beyond the existing skip guard                                         |
| Feature flags  | none                                                                                       |

---

## 3. Unit and integration (Vitest)

Ran locally: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (`vitest run --coverage`), plus `node scripts/check-permission-parity.mjs`, `node scripts/check-notification-catalog-parity.mjs`, `node scripts/check-env-parity.mjs`, `node scripts/check-migrations-append-only.mjs origin/main`. All green.

| Suite                         | Tests                                                                                                                                                                            | Passed | Failed | Skipped | Duration |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ------- | -------- |
| Whole monorepo (`vitest run`) | 579                                                                                                                                                                              | 579    | 0      | 0       | 9.16 s   |
| — of which `packages/db`      | includes 26 in `workspace-context.test.ts` (was 17 before this Part; +9 new: 4 removed/pending-vs-forger cases, 1 dependency-failure case, plus updated shared fixture)          |        |        |         |          |
| — of which `apps/web`         | includes 7 in `actions.test.ts` (was 3; +4: 3 `signInWithPassword` cookie cases, 1 `resetPassword` cookie-clear-timing case) and 5 (new file) in `resolve-landing-route.test.ts` |        |        |         |          |

### Coverage

| Package                                | Lines  | Branches | Functions | Threshold | Result |
| -------------------------------------- | ------ | -------- | --------- | --------- | ------ |
| Whole run (v8, all packages)           | 95.54% | 91.66%   | 95.42%    | 70%       | PASS   |
| `packages/db/src/workspace-context.ts` | 96.76% | 90.74%   | 100%      | 70%       | PASS   |

The one uncovered branch in `workspace-context.ts` (lines 408-415, the `if (!chosen)` defensive fallback in the "first active membership" step) predates this Part and is unreachable given `rows.length > 0` already guards it above — not touched here.

### Notable cases proven

- A removed member's stale header fails `membership_inactive` and the `log_tenancy_context_rejected` RPC is **not** called.
- A pending member's stale header fails the same way.
- Someone who never joined at all still fails `not_a_member` and the tripwire RPC fires **exactly once**, with the attempted workspace id.
- A database failure on the new "any row" check fails closed as `dependency_unavailable`, not a false tripwire and not a false pass.
- `signInWithPassword` deletes the `acadigma_workspace` cookie on success, before `resolveLandingRoute` runs — and does **not** delete it when credentials are rejected (nothing to clear; no session was minted).
- `signInWithPassword` still clears the cookie even when the newly-authenticated account turns out to be suspended (the session was minted before the suspension check runs).
- `resetPassword` clears the cookie immediately after `verifyOtp` mints the recovery session — before the post-exchange identity-similarity check can still reject the password.
- `resolveLandingRoute` is asserted, by inspecting the actual `Headers` instance passed to `resolveWorkspaceContext`, to never carry an `x-workspace-id` value — the direct regression guard for "middleware already mirrored a stale cookie into this request's headers."

---

## 4. Database (pgTAP)

**Not run locally** — no Docker, no local Postgres, and no reachable Supabase project in this sandbox (unchanged constraint from the 2026-09-17 report). CI's `db` job (fresh Postgres 17 + pgTAP, all migrations applied in order) is the real gate.

| Table / behaviour                                | Assertions (written)                                                                               | Result                                                                            | File                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| `data_requests` — cascade allowed                | Deleting a workspace with a `data_requests` row succeeds; the row survives, nulled                 | CI only                                                                           | `supabase/tests/10_tenancy_cascade.sql` |
| `data_requests` — direct re-parent still blocked | Owner of both ends still cannot `UPDATE ... SET workspace_id`; a direct null-out also still raises | CI only                                                                           | `supabase/tests/10_tenancy_cascade.sql` |
| Freeze-trigger catalogue invariant (existing)    | Every client-UPDATE-able `workspace_id` table still carries `app.tg_freeze_workspace`              | CI only (unchanged — this Part edits the trigger function's body, not attachment) | `supabase/tests/09_tenancy.sql`         |

**Specifically proven (once CI runs it):**

- A hard workspace delete with an attached DSAR record succeeds instead of raising `workspace_id is immutable`.
- The exact non-null → null transition is the _only_ one the exception allows: reparenting to a different workspace, or a direct client attempt to null the column outside an actual delete, both still raise `42501`.
- Nothing about the `school_profiles`/`notifications`/other frozen tables changes — the exception is scoped to `data_requests` by name, not by transition shape alone.

---

## 5. End to end (Playwright)

**Not run** — no browser infra in this sandbox; no UI changed in this Part. The existing `forged-workspace-header.spec.ts` journey is unaffected by this Part's changes (still gated by `E2E_LIVE_SUPABASE`, still reports **skipped** pending OQ-26/OQ-27) and was not touched.

---

## 6. Performance

Not applicable — no new UI, no new query added to a hot path (`resolveWorkspaceContext`'s new "any row" query only runs on the already-rare header-mismatch path, and only once the active-membership query has already come back empty).

---

## 7. Security checks

| Check                           | Result                                                                |
| ------------------------------- | --------------------------------------------------------------------- |
| gitleaks / secret scan          | not run locally — CI's `security` job covers it; no secret introduced |
| Semgrep                         | not run locally — CI's `security` job covers it                       |
| `pnpm audit --audit-level high` | not run in this session (no dependency changes)                       |
| Supabase advisors               | not applicable — no reachable project                                 |
| Authorized DAST                 | not applicable — no new endpoint or UI surface                        |

---

## 8. Known issues

| #   | Issue                                                                                                                                                                 | Severity | Ship anyway?                                                                                                                             | Tracked |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | The `pg_trigger_depth() > 1` cascade-detection condition in `app.tg_freeze_workspace()` cannot be exercised without a real Postgres, and was not run in this sandbox  | high     | yes — `supabase/tests/10_tenancy_cascade.sql` is written specifically to prove it; CI's `db` job is the required check and the real gate | —       |
| 2   | `09_tenancy.sql`/`10_tenancy_cascade.sql` were not re-run against a live database after this Part's migration — only reviewed by eye against the existing style       | medium   | yes — same CI dependency as #1                                                                                                           | —       |
| 3   | The `membership_inactive` reason has no dedicated UI copy yet — it renders through the same generic `forbidden()` screen as every other non-`unauthenticated` failure | low      | yes — AC6 only requires "the no-longer-have-access screen", which this already is; distinct copy is a UX nicety for a later Part         | —       |

**Deliberately not tested, and why:**

- The actual shared-phone browser flow end-to-end (two real sign-ins on one browser context) — this Part fixes it at the unit level (cookie clearing, header-ignoring) and the DB level (tripwire distinction); a dedicated e2e journey for it is a reasonable follow-up but was not requested and would need `E2E_LIVE_SUPABASE` to mean anything.

---

## 9. Sign-off

| Definition of Done                           | Met                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Spec written and matches the build           | ☑ (F-ID-03 §11 "Review follow-ups" added, DECISION-LOG D-52)                                                  |
| Migration + pgTAP isolation and escalation   | ☑ written / ☐ executed (no DB in this sandbox — CI is the gate)                                               |
| Unit tests + coverage thresholds             | ☑ (579/579, all thresholds met)                                                                               |
| UI built and verified at both viewports      | ☐ n/a — no UI change in this Part                                                                             |
| Playwright journey at both viewports         | ☐ n/a — no new journey; existing one unaffected                                                               |
| a11y — zero serious/critical + manual checks | ☐ n/a — no UI change                                                                                          |
| This test report, with real numbers          | ☑                                                                                                             |
| Docs updated in the same PR                  | ☑ (F-ID-03 §11, DATA-MODEL.md §7.5, DECISION-LOG D-52, this report, docs/README.md, supabase/tests/README.md) |

**Signed off by:** Claude (Sonnet 5, builder session)
**Date:** 2026-09-24
**Commit:** HEAD of `fix/tenancy-review-followups` at PR open time

> I ran `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and the four `node scripts/check-*.mjs` scripts named above myself in this worktree, and the numbers in §3 are copied from those real runs. `pnpm db:test` (pgTAP) and `pnpm e2e` were **not** run — this environment has no Docker, no local Postgres and no reachable Supabase project. Do not merge on the strength of this report alone for those two gates; CI's `db` and `e2e` checks are the real verification and are required checks per CLAUDE.md. The `pg_trigger_depth()`-based cascade exception in particular is unverified until CI's `db` job proves it.
