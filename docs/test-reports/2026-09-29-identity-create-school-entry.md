# Test Report — F-ID-05 / F-ID-03, fix: missing "Create a school" / "Join a school" entry points

<!--
  Small fix, not a numbered Part — see docs/features/01-identity/F-ID-05-onboarding.md
  §11 "Status / deviations recorded fixing the missing entry point (2026-09-29)".
-->

|         |                                                                                       |
| ------- | ------------------------------------------------------------------------------------- |
| Feature | F-ID-05 (onboarding) / F-ID-03 (workspace switcher) — entry-point fix, not a new Part |
| Spec    | `docs/features/01-identity/F-ID-05-onboarding.md` §11 (2026-09-29 note)               |
| PR      | (draft, opened this session) `fix/identity-create-school-entry`                       |
| Status  | **PASS WITH KNOWN ISSUES**                                                            |
| Date    | 2026-09-29                                                                            |
| Run by  | Claude (subagent), for Mahadi Islam                                                   |

---

## 1. Scope

**What this fixes.** Owner report: "why cant personal accounts create school workspace?" `/onboarding/create-school` and `public.create_school_workspace` were already correct; nothing inside the signed-in app linked to them. Fixed: the workspace switcher's chip (`workspace-switcher.tsx`) no longer collapses to non-tappable for a lone `personal` workspace, and now offers two explicit links, "Create a school" and "Join a school with a code"; the placeholder personal home (`(personal)/personal/page.tsx`) gets the same pair as its one primary action + a quiet secondary. No schema or RPC change — `create_school_workspace`'s existing limits (3 schools/user/day, 20-membership cap) were verified, not altered.

**Acceptance covered:**

| #   | Criterion                                                                                                                                                                | Covered by                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | A lone personal workspace keeps the switcher chip tappable                                                                                                               | `workspace-switcher.test.tsx` — "keeps the chip tappable for a lone PERSONAL workspace"        |
| 2   | A lone school workspace keeps §6's original non-tappable behaviour                                                                                                       | `workspace-switcher.test.tsx` — "keeps §6's non-tappable shortcut for a lone SCHOOL workspace" |
| 3   | Both pinned links route correctly                                                                                                                                        | `workspace-switcher.test.tsx` (same test, href assertions)                                     |
| 4   | Personal home shows "Create a school" as the primary action, reachable and 44 px                                                                                         | `personal-home-onboarding-entry.spec.ts` (e2e, live-Supabase gated)                            |
| 5   | `create_school_workspace` stays safe for an already-onboarded caller (no duplicate personal workspace, `onboarding_progress` cleanly overwritten, limits still enforced) | `supabase/tests/30b_create_school_already_onboarded.sql` (pgTAP, new file)                     |

**Out of scope:** F-ID-04 Part 5 (join-by-code) — not built; the "Join a school with a code" link routes to the existing chooser, which already shows that card as "Coming soon". No new decision-log entry (reasoning in the spec note). No change to `create_school_workspace` itself.

**Risk areas:** (a) the switcher's single-workspace shortcut is read by every shell — narrowed the condition rather than removing it, to avoid changing behaviour for school-only staff; (b) reusing a shared, budget-constrained live-Supabase fixture account for e2e without corrupting sibling specs' assumptions.

**Review run this session** (CLAUDE.md's always-on engineering discipline): `typescript-reviewer`, `react-reviewer`, and `ponytail-review` (background agents) against the full diff. Findings and fixes: `react-reviewer` HIGH — the two new switcher buttons defaulted to `h-9` (36px), below the 44px rule — fixed to `h-11`; `ponytail-review` — the pgTAP file's second scenario tested a population the diff doesn't affect — cut, `plan(11)` → `plan(6)`. Both addressed in this branch before the report below. `typescript-reviewer`'s result had not returned when this report was finalized; see the PR thread for it.

---

## 2. Environment

|                |                                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| Commit         | `47e6d970c466bd572d29f45aefebb665b3255ef1` (branch cut point; work committed on top) |
| Branch         | `fix/identity-create-school-entry`                                                   |
| CI run         | not yet run (draft PR being opened this session)                                     |
| Preview URL    | not yet available                                                                    |
| Supabase       | dev branch, shared across concurrent worktree sessions                               |
| Migration head | unchanged — this fix ships no migration                                              |
| Node / pnpm    | v24.x / pnpm 10.34.5                                                                 |
| Browsers       | Playwright's bundled Chromium (not launched — see §5)                                |

---

## 3. Unit and integration (Vitest)

Full monorepo run, `pnpm test` (vitest run --coverage), before vs. after this change:

| Suite         | Tests | Passed | Failed | Skipped | Duration |
| ------------- | ----- | ------ | ------ | ------- | -------- |
| Full monorepo | 1775  | 1741   | 1      | 33      | 62.17s   |

**The one failure** is `packages/pdf/src/register-marksheet-perf.test.ts` ("renders a 40-student, 31-day register within 4000ms", measured 4178ms) — a machine-load performance budget in an unrelated package (register PDF generation), reproduced with `git stash` of this diff on the same shared machine (many concurrent worktree sessions were running at the time); not caused by this change, whose diff touches no `packages/pdf` file.

Targeted run of the changed file, `apps/web/app/(shared)/workspace/workspace-switcher.test.tsx`: 6 tests (4 pre-existing + 2 new), all passing (confirmed inside the full-suite run above; the project-scoped filter invocation ran the whole `web` project — 481/481 passed).

`pnpm typecheck` (turbo, 7 packages): **PASS**, no cache-stale results.
`pnpm lint` (eslint .): **PASS**, zero warnings/errors.

### Coverage

Not measured in isolation for this change — a UI-only diff to two already-covered files plus one new pgTAP file; no new package or threshold-bearing module was added.

### Notable cases proven

- `WorkspaceSwitcher` keeps the chip non-interactive for a lone `type='school'` workspace (§6 unchanged there) — `workspace-switcher.test.tsx`.
- `WorkspaceSwitcher` makes the chip tappable for a lone `type='personal'` workspace and both pinned links (`/onboarding/create-school`, `/onboarding`) render with the right `href` — `workspace-switcher.test.tsx` (new).
- Existing switcher regression coverage (double-click guard, `aria-haspopup`/`aria-expanded`, D-109 shell-link) unaffected — same file, unchanged assertions, still passing.

---

## 4. Database (pgTAP)

No migration in this change. New coverage added for the existing `public.create_school_workspace` function, called by an already-onboarded caller — split into a new file (`30b_...sql`) rather than appended to `30_create_school_workspace.sql`, which is mid-edit in open PR #90.

| Assertion group                                                                                                                                                                    | File                                                     | Result              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------- |
| A caller who "completed" onboarding via the tutoring exit creates a school cleanly, still has exactly one personal workspace, `onboarding_progress` overwritten to `create_school` | `supabase/tests/30b_create_school_already_onboarded.sql` | not run — see below |

Originally also had a second scenario ("owner of one school creates a second"); cut after `ponytail-review` (background reviewer) correctly pointed out that population's switcher chip already had more than one workspace and was already tappable before this PR — that scenario proved nothing this diff changed. `plan(6)` now matches the six remaining assertions exactly.

**Not run to completion.** `pnpm db:test` was attempted against the shared cloud dev branch. It failed with `permission denied for schema tests` — reproduced **identically on the pre-existing, unmodified `30_create_school_workspace.sql`** and on several other unrelated, untouched test files in the same run, which confirms this is a pre-existing environment/concurrency issue on the shared dev branch (many other worktree sessions were active at the same time), not something this change caused. The new file (`30b_...sql`) is written and follows the exact helper/fixture pattern (`tests.mkuser`/`tests.login`/`tests.logout`/`tests.school_input`) `30_create_school_workspace.sql` already uses successfully in CI — but it has not been executed end to end by me. **This needs a real `pnpm db:test` run against an uncontended branch before merge.**

---

## 5. End to end (Playwright)

| Journey                                                                                                                      | 360 × 800 | 1280 × 800 | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personal-home-onboarding-entry.spec.ts` — personal home + switcher both reach `/onboarding/create-school` and `/onboarding` | not run   | not run    | `E2E_LIVE_SUPABASE` is not set in this sandboxed session — same skip guard every other live-Supabase journey in this repo carries (`register-verify.spec.ts`, `create-school-wizard.spec.ts`, `switch-workspace.spec.ts`, etc.). `npx playwright test --list` confirms the spec parses and registers correctly under both configured projects (phone/desktop). |

The spec deliberately stops at the wizard's first step loading, rather than submitting it: `create-school-wizard.spec.ts` already proves "submit → lands in `/app`", and this diff does not touch the wizard's completion path or `create_school_workspace`, so resubmitting would spend a second school against that account's 3-per-day budget (AC16) for no new coverage. The single-`type='personal'`-workspace switcher state (the exact case from the owner's report) is proven deterministically in Vitest instead (§3) rather than live, because reaching it live would require calling `completeOnboarding` against the shared `owner@acadigma.test` fixture other specs depend on landing at `/app`/`/onboarding` in a specific state.

**This needs a real Playwright run with `E2E_LIVE_SUPABASE=1` and the seeded fixtures before merge.**

### Accessibility (axe, WCAG 2.1 AA)

Not run live (same gate as above). Both new CTAs reuse existing, already axe-clean primitives (`Button asChild` + `next/link`, `EmptyState`) with no new custom markup; the spec calls `expectNoA11yViolations` on `/personal` (both before and after opening the switcher sheet, which `switch-workspace.spec.ts` already exercises clean).

### Manual checks

| Check                                        | 360 × 800                                                                                                                                                                                                                 | 1280 × 800 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Touch targets ≥ 44 px                        | `h-11` on every new button (personal home's primary + both switcher outline buttons; the switcher pair was `react-reviewer`-flagged at the default 36px `h-9` and fixed), `min-h-11` on the one text-style secondary link | same       |
| Visible focus ring                           | inherited from `Button`/`Link` primitives, unchanged                                                                                                                                                                      | same       |
| Primary action completable by keyboard alone | plain `<a>` via `next/link`, unchanged pattern                                                                                                                                                                            | same       |
| No horizontal scroll                         | single-column `flex flex-col` action group                                                                                                                                                                                | n/a        |

Not verified with a live browser render in this session — code-review-level confidence only, pending the live e2e run above.

---

## 6. Performance

Not applicable — no new route, no new data fetch, no bundle-affecting dependency.

---

## 7. Security checks

| Check                                           | Result                                                                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side limit enforcement                   | verified by code review: `create_school_workspace` enforces the 3/day and 20-membership caps inside the SECURITY DEFINER function itself, unchanged by this diff — the new entry points cannot bypass them |
| No client-side filtering / no price from client | not applicable — no data table, no money involved                                                                                                                                                          |
| `pnpm audit --audit-level high`                 | not run this session (no dependency change)                                                                                                                                                                |

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                 | Severity | Ship anyway?                                                                                  | Tracked |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- | ------- |
| 1   | pgTAP (`30b_...sql`) not executed — `db:test` failed on a pre-existing, unrelated shared-environment permission issue                                                                 | medium   | no — must be run clean before merge                                                           | —       |
| 2   | Playwright journey not executed live (`E2E_LIVE_SUPABASE` unset in this sandbox)                                                                                                      | medium   | no — must be run before merge, per this repo's own skip-guard convention                      | —       |
| 3   | F-ID-03 §6's own table still literally reads "only one workspace → not tappable"; the deviation is recorded in F-ID-05 §11 instead because F-ID-03's file is mid-edit in open PR #112 | low      | yes — F-ID-03 §6 should be updated to say "only one workspace of type school" once #112 lands |         |

**Deliberately not tested:** the full wizard-submission path from these new entry points (already covered by `create-school-wizard.spec.ts`, not re-run here — see §5); join-by-code end to end (not built, F-ID-04 Part 5).

---

## 9. Sign-off

| Definition of Done                           | Met                                     |
| -------------------------------------------- | --------------------------------------- |
| Spec written and matches the build           | ☑ (F-ID-05 §11 note)                    |
| Migration + pgTAP isolation and escalation   | ☐ — no migration; new pgTAP not yet run |
| Unit tests + coverage thresholds             | ☑ (§3)                                  |
| UI built and verified at both viewports      | ☐ — code review only, not live-rendered |
| Playwright journey at both viewports         | ☐ — written, parses, not executed live  |
| a11y — zero serious/critical + manual checks | ☐ — not executed live                   |
| This test report, with real numbers          | ☑                                       |
| Docs updated in the same PR                  | ☑ (F-ID-05 §11, this report, changeset) |

**Signed off by:** Claude (subagent), for Mahadi Islam — draft PR, not merge-ready
**Date:** 2026-09-29
**Commit:** see PR

> I ran `pnpm typecheck`, `pnpm lint`, and `pnpm test` myself and the numbers above are copied
> from those real runs. `pnpm db:test` and the live Playwright journey were attempted and are
> reported honestly as not completed, with the reason — both need a clean run before this PR
> is ready to merge. This is a draft PR by design (30-minute visibility requirement); it is not
> being represented as ready to ship.
