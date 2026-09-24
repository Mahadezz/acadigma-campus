# Test Report — Dependabot alert triage: vitest / @vitest/mocker (GHSA-82fw-gwwq-j7x9)

|         |                                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| Feature | Cross-cutting security triage (not a numbered feature) — Dependabot alerts #1–7        |
| Part    | Single Part: triage + fix                                                              |
| Spec    | `docs/decisions/DECISION-LOG.md` D-49 (release-age cooldown); `.audit-exceptions.json` |
| PR      | opened from `chore/deps-security-triage` against `main` (see PR description)           |
| Status  | **PASS**                                                                               |
| Date    | 2026-09-24                                                                             |
| Run by  | Claude (Sonnet 5)                                                                      |

---

## 1. Scope

GitHub's dependency graph, enabled today, surfaced "7 vulnerabilities (7 moderate)" — all seven Dependabot alerts trace to a single advisory, [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) ("Vitest: Path Traversal / Arbitrary File Read via `@vitest/mocker` Redirect Mock"), affecting `vitest` `>=2.1.0, <4.1.11` and its transitive dependency `@vitest/mocker`. `vitest` was a pinned `3.2.7` devDependency in five manifests (root `package.json` and `packages/{contracts,db,domain,ui}/package.json`); `@vitest/mocker` is pulled in transitively by `vitest` itself (no direct devDependency anywhere).

**Triage per alert:**

| Alert | Package          | Manifest                          | Direct/transitive                     | Runtime/dev | Reachable                                                                                           | Patch available     |
| ----- | ---------------- | --------------------------------- | ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- | ------------------- |
| #1    | `vitest`         | `package.json`                    | direct                                | dev         | yes — the vulnerable API is the test-mocker's module redirect, used by every workspace's test suite | 4.1.11              |
| #2    | `vitest`         | `packages/contracts/package.json` | direct                                | dev         | same as #1                                                                                          | 4.1.11              |
| #3    | `vitest`         | `packages/db/package.json`        | direct                                | dev         | same as #1                                                                                          | 4.1.11              |
| #4    | `vitest`         | `packages/domain/package.json`    | direct                                | dev         | same as #1                                                                                          | 4.1.11              |
| #5    | `vitest`         | `packages/ui/package.json`        | direct                                | dev         | same as #1                                                                                          | 4.1.11              |
| #6    | `@vitest/mocker` | `pnpm-lock.yaml`                  | transitive (via `vitest`)             | dev         | same as #1 (mocker is what `vitest` uses internally for `vi.mock`)                                  | 4.1.11 (via vitest) |
| #7    | `vitest`         | `pnpm-lock.yaml`                  | direct (lockfile-level view of #1–#5) | dev         | same as #1                                                                                          | 4.1.11              |

None of the seven ship to the browser or the server runtime — `vitest`/`@vitest/mocker` are devDependencies only, never imported by `apps/web` route handlers, server actions, or any `packages/*/src` module reachable from a production build (confirmed by the `pnpm --filter @acadigma/web build` output below, which does not bundle either package). All seven are **safely fixable**: `vitest@4.1.11` was published 2026-09-15, which is more than D-49's 2-day (`minimumReleaseAge: 2880`) cooldown before today (2026-09-24), so no `minimumReleaseAgeExclude` entry was needed. `.audit-exceptions.json`'s own convention (`$comment`) is explicitly scoped to "high or critical advisory we cannot fix yet" — these seven are all **moderate** and are fixed outright, so no exception entry was added; the file's `exceptions: []` is unchanged.

**Action:** bumped `vitest` (and its peer `@vitest/coverage-v8`, which must track vitest's major version) from `3.2.7` to `4.1.11` in all five manifests via direct `package.json` edits + `pnpm install` (transitively resolves `@vitest/mocker` to `4.1.11` too — `pnpm why @vitest/mocker -r` confirms a single resolved version, no `overrides` needed).

**Fallout from the major bump, fixed in this PR (both required to get the gate green, neither is a Dependabot alert):**

1. **`packages/ui` typecheck regression.** `src/motion/gsap.ts:78` reads `process.env.NODE_ENV`; `packages/ui/tsconfig.json` restricts `compilerOptions.types` to `["@testing-library/jest-dom"]`, so `process`'s ambient `NodeJS` typing was never declared there — it was only resolving because vitest 3.2.7's own type-declaration chain incidentally pulled in `@types/node`. Vitest 4 no longer does. Fixed by adding `@types/node` as a devDependency of `packages/ui` and `"node"` to its `tsconfig.json` `types` array.
2. **`vitest.workspace.ts` silently stopped working.** Vitest 4 removed the separate workspace-file mechanism (deprecated since 3.2); `defineWorkspace` no longer exists in `vitest/dist`. The file was still present and importable (so nothing errored at config-load time) but vitest 4 ignored it, silently falling back to the default `node` environment for every project — 67 DOM component tests in `packages/ui`/`apps/web` failed with `ReferenceError: document is not defined`. Fixed by moving the five project definitions (`domain`, `contracts`, `db`, `web`, `ui`) into `test.projects` inside `vitest.config.ts` (vitest 4's documented replacement) and deleting `vitest.workspace.ts`. Updated the two doc references (`docs/engineering/TESTING.md`, `apps/web/test/server-only-stub.ts`) that named the old file.

No other code changes. No production dependency changed.

---

## 2. Environment

|             |                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worktree    | `.worktrees/deps-triage`, branch `chore/deps-security-triage` off `origin/main`                                                                                                |
| Node / pnpm | v24.x / 10.34.5                                                                                                                                                                |
| Install     | `pnpm install --frozen-lockfile` before changes; `pnpm install` after the manifest edits (lockfile updated); `pnpm install --frozen-lockfile` again to confirm reproducibility |

---

## 3. Full gate (local)

| Check                                                | Result | Notes                                                                                             |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                     | PASS   | no D-49 release-age block (vitest 4.1.11 is 9 days old)                                           |
| `pnpm format:check`                                  | PASS   | Prettier clean                                                                                    |
| `pnpm typecheck`                                     | PASS   | all 6 packages (`config`, `contracts`, `db`, `domain`, `ui`, `web`) — after the `@types/node` fix |
| `pnpm lint`                                          | PASS   | `eslint .` clean                                                                                  |
| `pnpm test`                                          | PASS   | `Test Files 53 passed (53)` / `Tests 700 passed (700)` — after the `test.projects` migration      |
| `node scripts/check-audit-catalog-parity.mjs`        | PASS   |                                                                                                   |
| `node scripts/check-bundle-budget.mjs`               | PASS   | (no-op without a prior `pnpm build`; ran again after build, see below)                            |
| `node scripts/check-changeset.mjs`                   | PASS   | changeset added — see §4                                                                          |
| `node scripts/check-coverage-test-files.mjs`         | PASS   |                                                                                                   |
| `node scripts/check-docs-sync.mjs`                   | PASS   |                                                                                                   |
| `node scripts/check-env-parity.mjs`                  | PASS   | pre-existing warnings only (unrelated env vars)                                                   |
| `node scripts/check-migrations-append-only.mjs`      | PASS   |                                                                                                   |
| `node scripts/check-notification-catalog-parity.mjs` | PASS   |                                                                                                   |
| `node scripts/check-permission-parity.mjs`           | PASS   |                                                                                                   |
| `pnpm --filter @acadigma/web build`                  | PASS   | `next build` — 18/18 static pages generated, no type/lint errors during build                     |

Coverage thresholds (root `vitest.config.ts`, unchanged by this PR): 92.45% statements / 83.13% branches / 92.07% functions / 94.08% lines overall — all above the 70% floor; `packages/domain` above its 80% floor. No threshold regressions.

---

## 4. Changeset

`.changeset/deps-security-triage-vitest.md` added (`@acadigma/contracts`, `@acadigma/db`, `@acadigma/domain`, `@acadigma/ui`, `@acadigma/web`, all `patch`) — required because the PR touches files under `packages/*` and `apps/web/test/` (`scripts/check-changeset.mjs`).

---

## 5. Security checks

| Check                                                                    | Result                                                                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependabot alerts #1–7 (`vitest`, `@vitest/mocker`, GHSA-82fw-gwwq-j7x9) | **Fixed** — both resolve to `4.1.11` across the tree (`pnpm why vitest -r` / `pnpm why @vitest/mocker -r` show a single resolved version each) |
| D-49 release-age cooldown                                                | Satisfied without an exclude entry (patch published 9 days ago)                                                                                |
| `.audit-exceptions.json`                                                 | Unchanged (`exceptions: []`) — its convention covers high/critical advisories only; these are moderate and are fixed outright, not held        |
| Other open Dependabot alerts                                             | None — `gh api .../dependabot/alerts` shows these were the only 7 open, state=open, before this PR                                             |

---

## 6. Known issues

None introduced by this PR. `@vitest/coverage-v8`/`vitest`/`@vitest/mocker` each report a newer `5.0.1`/`5.x` available; not taken here — 4.1.11 is the advisory's `first_patched_version` and a second major bump in the same PR is out of scope for a security triage (would need its own compatibility pass).

---

## 7. Sign-off

| Definition of Done                            | Met                                                                |
| --------------------------------------------- | ------------------------------------------------------------------ |
| All 7 alerts triaged and dispositioned        | ☑ (table in §1)                                                    |
| Safely fixable alerts fixed                   | ☑ (all 7 — single advisory, single bump)                           |
| D-49 respected                                | ☑ (no exclude entry needed)                                        |
| `.audit-exceptions.json` convention respected | ☑ (moderate severity out of scope for that file; left untouched)   |
| Full local gate green                         | ☑ (§3)                                                             |
| Changeset                                     | ☑ (§4)                                                             |
| Docs updated in the same PR                   | ☑ (this report + `docs/README.md` + the two stale-reference fixes) |

**Signed off by:** Claude (Sonnet 5)
**Date:** 2026-09-24
