# Acadigma Campus — CI

The pipeline: exact stages, what each gate checks, and what is required to merge. This document is the **specification** for `.github/workflows/*`; the scaffold agent implements it. If the YAML and this file diverge, one of them is a bug — fix both in the same PR.

Implements D-14 and ARCHITECTURE §9. Runners: `ubuntu-latest`. Node 24, pnpm 10 (D-12). Every third-party action is **pinned to a commit SHA**, never a tag.

---

## 1. Workflows at a glance

| File             | Name            | Trigger                                                                                           | Purpose                                                                       |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `ci.yml`         | `CI`            | `pull_request` (opened, synchronize, reopened, ready_for_review), `push` to `main`, `merge_group` | All merge gates                                                               |
| `release.yml`    | `Release`       | `push` to `main`                                                                                  | Changesets version PR, tag, GitHub Release, production Supabase migration     |
| `weekly.yml`     | `Weekly Checks` | `schedule` (Mon 03:00 UTC), `workflow_dispatch`                                                   | Advisors, dependency audit, flake report, quarantine expiry, exception expiry |
| `preview-db.yml` | `Preview DB`    | `pull_request` (closed)                                                                           | Clean up per-PR database artifacts                                            |

Concurrency: `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true` on PRs and `false` on `main`. A superseded PR run is wasted money; a cancelled `main` run is a half-applied release.

Draft PRs run every job except `e2e` and `lighthouse` — the expensive ones start when the PR is marked ready. That keeps the "push on the first commit" habit (HANDBOOK §2) cheap.

**Job skipping (D-70).** A first job, `changes`, diffs the PR against its base with a plain `git diff --name-only <base>...HEAD` (no third-party action) and outputs two booleans: `db` (`supabase/**` or `.github/workflows/**` changed) and `app` (`apps/**`, `packages/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig*`, `.github/workflows/**` or `scripts/**` changed). Neither true means the PR is docs-only. `push` to `main` and `merge_group` always set both true — those runs are never partial. Everything downstream reads these outputs instead of recomputing the diff:

- `lint`, `typecheck`, `unit`, `contracts`, `build`, `security` run when `app` or `db` is true; skipped for a docs-only PR.
- `db` runs only when `db` is true.
- `e2e`, `lighthouse` run only on `pull_request` (never `push` to `main` — they already ran on the PR that merged), never on a draft, and only when `app` or `db` is true. Their `needs` include `build` (and `db` for `e2e`); because a **skipped** upstream job would otherwise auto-skip anything that needs it, their `if` checks `needs.build.result == 'success'` (and, for `e2e`, `needs.db.result` is `'success'` **or** `'skipped'`) explicitly, so a docs-untouched `db` job doesn't take `e2e` down with it.
- `changeset`, `docs-sync`, `report` and `guard` are unaffected — they either run unconditionally on every PR/push or already do their own contextual pass/fail (`changeset`/`docs-sync` pass automatically for a docs-only diff; see §2.10-2.11).

A **skipped** job reports as a passing check to GitHub, so the required-checks list (§3) stays green without any branch-protection change. `report`'s `needs.<job>.result` already renders `skipped` with its own icon (⏭️), so a run with several skipped jobs still produces a correct summary comment.

---

## 2. `CI` — stages

```
                 ┌──────────┐
                 │  setup   │  checkout, node, pnpm, restore caches, install
                 └────┬─────┘
       ┌──────────────┼───────────────┬──────────────┬─────────────┐
       ▼              ▼               ▼              ▼             ▼
    lint          typecheck          db          security      changeset
                                      │
       └──────┬───────┴───────┬───────┴──────────┐
              ▼               ▼                  ▼
            unit          contracts            build
              │               │                  │
              └───────┬───────┴──────────────────┘
                      ▼
            ┌─────────┴──────────┐
            ▼                    ▼
          e2e                lighthouse
            │                    │
            └─────────┬──────────┘
                      ▼
                  docs-sync  (runs in parallel from setup; listed last as it gates the merge)
                      ▼
                  report     (always(); aggregates summaries + PR comment)
```

`db` starts immediately because migrations must be on the dev branch before `unit` (integration tests) and `e2e` run against it.

### 2.0 `setup`

Checkout with `fetch-depth: 0` (gitleaks and changeset detection need history). `corepack enable` and `pnpm/action-setup` pinned to pnpm 10. `actions/setup-node` with `node-version-file: .nvmrc` and `cache: pnpm`. Install with **`pnpm install --frozen-lockfile`** — a lockfile that does not match `package.json` fails here, which is the supply-chain gate (SECURITY §6).

Outputs consumed by later jobs: the store cache key, and a `changed` matrix (`apps`, `packages`, `supabase`, `docs`, `.github`) computed from the diff against the merge base, used to skip work that cannot be affected.

### 2.1 `lint` → check name **`CI / lint`**

- ESLint across the workspace with `--max-warnings=0`. Warnings are errors; a warning nobody fixes is noise that hides the next real one.
- Prettier `--check`.
- Custom rules that matter and must not be disabled: `no-explicit-any`; `no-restricted-imports` blocking `@acadigma/db`, `next/*` and `node:*` from `packages/domain` (keeps it pure and fast to test); Supabase mutation calls forbidden in `'use client'` files; a non-`NEXT_PUBLIC_` env var read in a client component.
- `.env.example` parity: every `process.env.X` referenced in the tree exists in `.env.example`, and vice versa. This is what stops a new variable silently breaking every other checkout.
- Markdown lint on `docs/**` (link check included — a broken link in the handbook is a real defect since agents read these files).

### 2.2 `typecheck` → **`CI / typecheck`**

`tsc --noEmit` for every package plus `apps/web`, using project references so it is incremental. Runs against the **committed** `types.generated.ts`; freshness is the `db` job's (D-55), so a stale-types failure reports as the right thing.

### 2.3 `db` → **`CI / db`**

The authorization gate. Runs only when the `changes` job's `db` output is true (§1). Runs against a disposable **Postgres 17 service container**, not the Supabase dev branch — branching needs the Supabase Pro plan, which is deferred until launch (D-20).

1. **Migration append-only check** (PRs only): `scripts/check-migrations-append-only.mjs` verifies every file in `supabase/migrations` is new-only relative to `origin/<base-ref>` (no edits to already-applied migrations — forward-only is checked mechanically, not trusted). Fails with the offending filename.
2. **Migration order check** (PRs only, D-69/D-70): `scripts/check-migrations-order.mjs` compares every migration **added** in the PR (vs. the merge-base with `origin/<base-ref>`, same diff shape as the append-only check) against the newest migration timestamp already on the base ref. Any added migration whose timestamp sorts at or before that newest timestamp fails with a `::error` naming the file and a suggested new filename — `main`'s newest timestamp plus one sequence step, keeping the offending file's own lane digit (`docs/plan/LANES.md`) where that still sorts later. **Re-dating:** `git mv supabase/migrations/<old>.sql supabase/migrations/<suggested>.sql`, update any reference to the old filename, re-run the gate. The migration has never been applied, so the rename is safe — this is exactly the situation LANES.md's "Migration order at merge time" describes: lanes merge in whatever order they finish, so a PR written against one `main` can fall behind another lane's PR that merged first.
3. pgTAP is installed **inside the service container** (`apt-get install postgresql-17-pgtap` against the official `postgres:17` image); `psql` and `pg_prove` (`libtap-parser-sourcehandler-pgtap-perl`) are installed on the runner.
4. `supabase/ci/bootstrap.sql` creates the Supabase-shaped roles and schemas the migrations expect — **including Supabase's default function-EXECUTE grant** (D-54): `alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role`, matching what the Supabase platform runs once when a project is created. A plain `postgres:17` container has no such default, so without this line a migration that grants a function to the wrong role — or forgets a `revoke`/grant entirely — passes CI's pgTAP grant assertions and is only wrong on the real project. `supabase/tests/12_function_grants_invariant.sql` is the standing assertion that this parity holds and that new functions are deny-by-default; a migration that grants EXECUTE too broadly turns it (and the narrower per-function assertions in `06_auth.sql`/`09_tenancy.sql`) red here, in CI, instead of on production.
5. Every file in `supabase/migrations/*.sql` is applied in sorted order with `psql`.
6. **RLS coverage:** if `supabase/tests/coverage.sql` exists it runs and fails the job on any gap. **It does not exist yet** — the job emits a `::warning::` instead of failing until the database agent lands it.
7. `pg_prove --verbose --ext .sql supabase/tests/*.sql`; the TAP output is tee'd to `pgtap.tap`, tailed into `$GITHUB_STEP_SUMMARY`, and uploaded as the `pgtap` artifact (14 days).

Fails on: an edited historical migration, a migration that sorts before `main`'s newest, or any pgTAP assertion failure. Coverage gaps only warn until `supabase/tests/coverage.sql` exists. No shared-resource concurrency lock is needed — every run gets its own throwaway container.

### 2.4 `unit` → **`CI / unit`**

`pnpm test:cov` across the Vitest workspace (domain, server, ui projects — `TESTING.md` §2), with the dev-branch credentials from `db` for the server-integration project.

- Thresholds enforced by Vitest config: `packages/domain` ≥ 80 % lines, repo ≥ 70 %. Below → fail.
- Reporters: `default`, `json` (→ `unit-results` artifact), `junit` (for the annotation), plus `json-summary` + `lcov` coverage.
- Job summary: suites/passed/failed/skipped/duration table, and a coverage table per package with the delta against `main`'s last successful run.
- Retries: **zero.** A unit or integration test that needs a retry is a bug report.

### 2.5 `contracts` → **`CI / contracts`**

Cheap drift detection, separated so the failure message is unambiguous:

- Postgres enums ↔ Zod enums: identical names and labels, exhaustively both ways.
- Generated-type freshness moved to the `db` job (D-55): see that job's "Generated types match this PR's migrations" step.
- Every permission key used in code exists in the domain matrix, and vice versa.
- Every feature flag key referenced in code exists in the `feature_flags` seed.

### 2.6 `build` → **`CI / build`**

`pnpm build` for the whole workspace, `NODE_ENV=production`, with Next.js cache restored. Additionally:

- Fails on any Next.js build warning that indicates a runtime hazard (missing `use client`, dynamic server usage in a static route).
- **Bundle budget:** parses the route analysis and fails if any route under `(school)/app` exceeds 250 kB first-load JS gzipped (TESTING §6).
- Uploads `.next` + the standalone output as the `build` artifact for `e2e` and `lighthouse`, so those jobs do not rebuild.

### 2.7 `security` → **`CI / security`**

Three scanners, one gate:

- **gitleaks** over the PR commit range (full history on `main` pushes). Any finding fails. A false positive is allowlisted in `.gitleaks.toml` with a comment; the rule is never disabled wholesale.
- **Semgrep** — `p/typescript`, `p/react`, `p/nextjs`, `p/owasp-top-ten`, `p/secrets` plus `.semgrep/acadigma.yml` (custom rules listed in `SECURITY.md` §8). **ERROR** severity fails; **WARNING** is annotated on the diff. SARIF uploaded to code scanning.
- **`pnpm audit --audit-level high`** against the lockfile. High or critical fails unless present and unexpired in `.audit-exceptions.json`.
- **Dependency review action** on PRs: flags newly introduced advisories and license changes.

Runs on `pull_request` (not `pull_request_target`) so a fork PR cannot reach secrets. Semgrep works without `SEMGREP_APP_TOKEN`; the token only syncs rules.

### 2.8 `e2e` → **`CI / e2e`**

Skipped on draft PRs. Needs `build` and `db`.

1. Wait for the Vercel preview deployment for this commit, or start the built app locally with `pnpm start` — preview is preferred because it exercises the real edge/runtime path. `E2E_BASE_URL` is set from whichever was used and is recorded in the summary.
2. `pnpm exec playwright install --with-deps chromium` (cached).
3. Run both projects — **`phone` (360×800) and `desktop` (1280×800)** — against the single spec file (`e2e/smoke.spec.ts`). No sharding, no `playwright merge-reports` step.
4. `@axe-core/playwright` runs inside the journeys. **Serious and critical violations fail the job**; moderate/minor are attached.
5. Security-header assertions run here too (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`) — they are only observable against a real response.
6. Artifacts: `playwright-report` (HTML, merged, 30 days), traces and videos for failures only.
7. Summary: journey · viewport · result · duration table, axe violation counts, and a **flaky count** (passed on retry). Retries are 1 in CI; flaky > 0 is surfaced prominently and blocks merge unless justified (`TESTING.md` §8).

### 2.9 `lighthouse` → **`CI / lighthouse`**

Skipped on draft PRs. Lighthouse CI against the preview URL, mobile emulation, 3 runs median, on the app shell and `/app/dashboard`. Fails below: PWA 90, Accessibility 95, Performance 85, or LCP above 2.5 s. Uploads `lighthouse-report`; scores table to the summary.

### 2.10 `changeset` → **`CI / changeset`**

Fails when the diff touches `apps/` or `packages/` and `.changeset/*.md` has no new file — unless the PR carries the `no-changeset` label, in which case it passes and prints a note asking the reviewer to confirm the reason in the description. Docs-, test- and CI-only PRs pass automatically.

### 2.11 `docs-sync` → **`CI / docs-sync`**

The mechanical half of "a docs change is part of every PR" (HANDBOOK §10):

- Diff touches `supabase/migrations/**` → `docs/architecture/DATA-MODEL.md` must also change.
- Diff touches `apps/**` or `packages/**` → either some `docs/**` file changed, or the PR body contains an explicit `docs: none — <reason>` line. The job prints which rule it applied.
- A new file in `docs/` → `docs/README.md` must list it.
- A new `supabase/tests/rls/<table>.sql` without the matching migration, or the reverse, fails.
- A new `D-nn` heading in `DECISION-LOG.md` must not reuse an existing number.

This job cannot verify that docs are _good_; it verifies they were not forgotten. Reviewers do the rest.

### 2.12 `report` → not required, `if: always()`

Aggregates the job summaries into one PR comment (updated in place, never appended as a new comment on each push): overall status, coverage delta, pgTAP table count, e2e results per viewport, axe counts, flaky count, artifact links, preview URL, and links to any `docs/test-reports/` file added in this PR. Needs `pull-requests: write`; skipped for fork PRs, where the summaries are still visible on the run.

---

## 3. Required status checks (branch protection on `main`)

These exact names go in the branch protection rule. They are contract — renaming a job silently disables its gate, so a rename is a reviewed change in this document too.

```
CI / guard
CI / lint
CI / typecheck
CI / db
CI / unit
CI / contracts
CI / build
CI / security
CI / e2e
CI / lighthouse
CI / changeset
CI / docs-sync
```

Additional branch protection settings on `main`:

- Require a pull request before merging; **1 approving review**; dismiss stale approvals on new commits.
- Require review from **Code Owners** (`@Mahadezz`).
- Require branches to be up to date before merging (merge queue satisfies this).
- Require conversation resolution before merging.
- Require linear history. **Squash merge only** — merge commits and rebase merges disabled at the repository level.
- Require signed commits (once the owner has signing configured; until then, tracked as an open item).
- No force pushes, no deletions.
- Include administrators — the rules apply to the owner too, otherwise they are suggestions.
- Auto-delete head branches on merge.

`CI / report` is deliberately **not** required: it runs on `always()` and would block on an unrelated failure.

---

## 4. Secrets

Repository secrets (Settings → Secrets and variables → Actions). Nothing here is ever echoed; `add-mask` is applied to any value derived from one.

| Secret                                                              | Used by                        | Purpose                                                               |
| ------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`                                             | `db`, `release`                | CLI auth: branches, migrations, type generation                       |
| `SUPABASE_PROJECT_REF`                                              | `db`, `release`                | `kekfmibwjejdhxjkmezo` (a variable, not a secret, but kept alongside) |
| `SUPABASE_DB_PASSWORD`                                              | `release`                      | Production migration promotion                                        |
| `SUPABASE_DEV_DB_URL`                                               | `db`, `unit`                   | Direct Postgres URL for pgTAP and integration tests                   |
| `SUPABASE_SERVICE_ROLE_KEY_DEV`                                     | `unit`, `e2e`                  | Seeding and test fixtures **on the dev branch only**                  |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `build`, `e2e`                 | Public by design; stored as variables                                 |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`                | `e2e`, `lighthouse`, `release` | Resolve the preview deployment; production rollback/promotion         |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`                 | `release`                      | Release creation and source map upload                                |
| `SEMGREP_APP_TOKEN`                                                 | `security`                     | Optional rule sync                                                    |
| `CRON_SECRET`                                                       | `e2e`                          | Exercise cron routes in the preview                                   |
| `E2E_TEST_PASSWORD`                                                 | `e2e`                          | Password for seeded synthetic test accounts                           |
| `GITHUB_TOKEN`                                                      | all                            | Provided automatically; least privilege per job                       |

Rules: never in `pull_request_target`; fork PRs run without secrets and their `e2e`/`lighthouse` jobs are skipped with an explicit note rather than passing vacuously. Production gateway, email and Anthropic keys are **not** in GitHub Actions at all — they live only in Vercel, because CI has no reason to touch a live provider.

---

## 5. Caching

| Cache                 | Key                                                                                   | Why                              |
| --------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| pnpm store            | `pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`                            | Biggest single win               |
| Next.js build         | `next-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('apps/web/**/*.[jt]s?(x)') }}` | Incremental builds               |
| Turbo remote/local    | `turbo-${{ github.job }}-${{ github.sha }}`, restore from branch then `main`          | Task-level skipping across jobs  |
| TypeScript build info | `tsbuildinfo-${{ hashFiles('**/tsconfig*.json','pnpm-lock.yaml') }}`                  | Project-reference incrementality |
| Playwright browsers   | `pw-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`                              | Browser download is ~1 min       |
| Semgrep rules         | `semgrep-${{ hashFiles('.semgrep/**') }}`                                             | Avoids a registry fetch per run  |

Never cache anything derived from a secret or from database content. Caches restore-key down to the `main` branch's cache so a fresh branch is not cold. Artifacts, not caches, move data between jobs.

---

## 6. Previews and the Supabase project

- There is no Supabase dev branch yet: branching needs the Pro plan, and until Release 1 launches the Campus project `kekfmibwjejdhxjkmezo` is deliberately both dev and prod (D-20, D-53). The dev machine also has no Docker, so there is no per-PR local database either.
- Vercel builds a preview per PR commit. Where a preview needs data, it points at the same production Supabase project **read-only** — previews never seed, migrate, or otherwise write against it.
- `CI / db` never touches that project: a PR's migrations are applied and pgTAP-tested against a disposable Postgres 17 service container (§2.3), not the shared project. Only the `push` job in `db.yml`, triggered by a `push` to `main`, applies migrations to production; previews see the new schema once that lands.
- Seed data on the shared project is marked demo and is wiped before launch.
- At launch: upgrade to Supabase Pro (backups, PITR, branching) and switch previews to real per-PR branches — tracked as a `db.yml` config change only (D-20).

---

## 7. Weekly jobs (`Weekly Checks`)

Not merge gates. They fail loudly and open or update an issue labelled `weekly` assigned to `@Mahadezz`.

| Job               | Checks                                                                                                        | Fails on                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `advisors`        | `supabase advisors` (security + performance) on **production** and dev                                        | Any new **security** advisory; performance advisories are reported                                                    |
| `audit`           | `pnpm audit --audit-level moderate`, dependency review, outdated report                                       | New high/critical; **any expired entry in `.audit-exceptions.json`**                                                  |
| `secrets-history` | gitleaks over the full repository history                                                                     | Any finding, even in old commits                                                                                      |
| `flake-report`    | Parses the week's Playwright JSON from artifacts                                                              | Reports the flake count and top offenders; fails if any quarantined test is older than **7 days** (`TESTING.md` §8.4) |
| `budgets`         | Lighthouse against **production**, not preview                                                                | Any budget breach on the live app                                                                                     |
| `restore-drill`   | Quarterly (first Monday of the quarter): restore the latest backup into a throwaway branch, verify row counts | Failure to restore, or a drill older than one quarter                                                                 |
| `link-check`      | External links in `docs/**`                                                                                   | Dead links (reported, not blocking)                                                                                   |

---

## 8. Notes for the implementer

- Name the workflow `CI` and the jobs exactly as in §3 — the check names are `<workflow name> / <job id>` and branch protection matches on that string.
- Reusable composite action for setup (checkout + node + pnpm + install) so the six-line preamble lives in one place.
- Every job writes to `$GITHUB_STEP_SUMMARY`; that is where the reviewer looks first, and it is free.
- Set `timeout-minutes` on every job (10 for the fast ones, 30 for `e2e`) so a hung runner does not block a merge for six hours.
- `continue-on-error` is never used on a required job. If a check is not worth blocking on, it does not belong in §3.
- Target total PR wall-clock: **under 12 minutes** for a ready PR, under 5 for a draft. Parallelism and caching are how; skipping tests is not.
- Fork PRs: `e2e`, `lighthouse` and `report` skip with an explicit "skipped: no secrets on fork PRs" annotation. A maintainer re-runs them from a branch in the repository before merge.

## Generated types (D-55)

`packages/db/src/types.generated.ts` is checked in the `db` job, after the PR's own migrations are applied to the CI Postgres: `supabase gen types typescript --db-url <ci postgres> --schema public`, formatted with Prettier, byte-compared with the committed file. It is **not** generated from the live project, because the live project only receives a PR's migrations after the PR merges, so a schema-changing PR could never pass a live-based check.

On a mismatch the job fails and uploads the fresh file as the `types-generated` artifact. To fix, from the repo root:

```
rm packages/db/src/types.generated.ts && gh run download <run-id> -n types-generated -D packages/db/src
```

then commit. The `rm` matters: `gh run download` refuses to overwrite a file that already exists at the destination and prints nothing when it skips one, so without it the download silently does nothing and the file is left stale. No local Docker is needed.
