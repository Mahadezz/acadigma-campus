# Test report — Foundation (chore/foundation)

|             |                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope       | Monorepo toolchain, foundation migrations 0001–0004, packages (contracts/domain/db/ui/config), Next.js app shell, CI workflows                |
| Branch / PR | `chore/foundation` → `main`                                                                                                                   |
| Environment | Windows 10 Pro, Node 24.19.0, pnpm 10.34.5, Chromium (Playwright 1.63). No local Postgres (Docker being installed) — DB tests run in CI only. |
| Date        | 2026-09-17                                                                                                                                    |
| Executed by | Scaffold agent (full run) · re-verified by lead (format, typecheck, unit)                                                                     |

## Results

| Suite                          | Result                                                                                                                                          | Detail                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`            | PASS                                                                                                                                            | after `pnpm format` on 4 docs edited post-run                                                                        |
| `pnpm typecheck`               | PASS                                                                                                                                            | 5/5 packages                                                                                                         |
| `pnpm lint`                    | PASS                                                                                                                                            | 0 errors, 0 warnings                                                                                                 |
| `pnpm test` (Vitest)           | PASS                                                                                                                                            | 141 tests, 10 files                                                                                                  |
| Coverage                       | 75.97 % lines / 96.75 % branches overall; **`packages/domain` 100 % statements/functions/lines, 98.9 % branches**; `workspace-context.ts` 100 % |
| `pnpm build`                   | PASS                                                                                                                                            | `/app/dashboard` first load 185 kB; bundle budget 182 kB gz vs 250 kB                                                |
| `pnpm test:e2e` (Playwright)   | PASS                                                                                                                                            | 8/8 — 4 journeys × `phone` (360×800) + `desktop` (1280×800); axe clean                                               |
| pgTAP (`supabase/tests/01–05`) | **NOT RUN LOCALLY**                                                                                                                             | 89 assertions; executes in `CI / db` against a Postgres 17 service container                                         |
| CI helper scripts              | PASS                                                                                                                                            | env parity, permission parity (20 declared / 3 referenced), bundle budget, coverage + e2e summaries                  |
| Workflow YAML                  | PASS (parse)                                                                                                                                    | job ids: guard, lint, typecheck, db, unit, contracts, build, security, e2e, lighthouse, changeset, docs-sync, report |

## Defects found and fixed during verification

1. `emailSchema` validated before trimming → rejected pasted addresses with trailing space. Reordered transforms; test added.
2. `Math.random()` during render in shadcn `SidebarMenuSkeleton` → hydration mismatch. Deterministic widths.
3. Playwright `webServer` hung on Windows (undrained stdout via `pnpm start`). Direct `next start`, `stdout: ignore`, readiness on `/api/health`.
4. `tsconfig.base.json` relative `extends` broke through pnpm symlinks for ESLint's resolver. Preset extended by package name.
5. `upgrade-insecure-requests` in report-only CSP (ignored + console error). Removed until enforcing.
6. `reloadOnOnline: true` in service worker would discard a half-finished attendance register. Removed.
7. Bundle-budget script compared raw bytes to a gzipped budget and double-counted layouts. Fixed.
8. e2e summary read wrong Playwright status vocabulary; flaky count was fake. Fixed.

## Not verified on this machine (CI will be the first execution)

- `CI / db`: pgTAP suites, `pg_format` lint, `supabase db push`.
- `pnpm db:types` / type-freshness check (no `SUPABASE_ACCESS_TOKEN` locally); `types.generated.ts` is a placeholder.
- gitleaks, Semgrep, dependency-review, changesets action, Lighthouse CI (PWA ≥ 90 asserted, not measured).
- Real sign-in against the Supabase project; `resolveWorkspaceContext` proven against a fake client only.

## Known issues / follow-ups (tracked in the PR)

- `docs/engineering/CI.md` §2.3/§6 still describe the Supabase-branch flow; reconcile to the service-container flow (D-20). §2.8 project names → `phone`/`desktop`.
- `supabase/tests/coverage.sql` not yet written; `CI / db` warns instead of failing until it lands.
- PWA icons are generated placeholders.
- `/api/health` returns `degraded` locally by design (no service-role key).

## Sign-off

Foundation meets the M0 0.1 + scaffold scope of `docs/plan/ROADMAP.md`. Merge is conditional on `CI / db` passing on the first run; any migration failure is fixed forward in this PR.
