# Test report — M0 chunk 0.9: UI primitives conformance, OpenTelemetry, `redactForAI()`

|             |                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Scope       | `packages/ui` primitives conformance to DESIGN-SYSTEM.md §3–§7, OpenTelemetry wiring (D-30), `redactForAI()` + Semgrep rule (D-34) |
| Branch / PR | `feat/m0-ui-otel-redaction` → `main`                                                                                               |
| Environment | Windows 10 Pro, Node 24.19.0, pnpm 10.34.5, Chromium (Playwright 1.63)                                                             |
| Date        | 2026-09-17                                                                                                                         |
| Executed by | Builder agent (full local run)                                                                                                     |

## Results

| Suite                             | Result  | Detail                                                                                                           |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`               | PASS    | 0 files need formatting                                                                                          |
| `pnpm typecheck`                  | PASS    | 5/5 packages (`contracts`, `domain`, `db`, `ui`, `web`)                                                          |
| `pnpm lint`                       | PASS    | 0 errors, 0 warnings                                                                                             |
| `pnpm exec vitest run --coverage` | PASS    | 255 tests, 19 files, 0 failed                                                                                    |
| `pnpm build`                      | PASS    | `/design` 10 kB route / 234 kB First Load JS; all other routes unchanged                                         |
| `pnpm exec playwright test`       | PASS    | 10/10 — 4 smoke journeys + the new design-smoke spec, each × `phone` (360×800) + `desktop` (1280×800); axe clean |
| pgTAP                             | NOT RUN | No schema/RLS changes in this chunk; nothing to exercise                                                         |

### Coverage (packages tracked by `vitest.config.ts`, `.ts` sources only — `.tsx` primitives are exercised by the component tests below but are outside the coverage `include` glob)

| Package                                                     | Lines   | Branches | Functions | Threshold | Result |
| ----------------------------------------------------------- | ------- | -------- | --------- | --------- | ------ |
| `packages/domain/src`                                       | 100 %   | 98.94 %  | 100 %     | 80 %      | PASS   |
| `packages/domain/src/ai` (new)                              | 100 %   | 100 %    | 100 %     | 80 %      | PASS   |
| `packages/ui/src/primitives` (`.ts` only — `nav-config.ts`) | 100 %   | 100 %    | 100 %     | 70 %      | PASS   |
| `packages/ui/src/hooks` (new `use-virtual-range.ts`)        | 96.92 % | 84.61 %  | 100 %     | 70 %      | PASS   |
| Repository overall                                          | 90.88 % | 97.8 %   | 92.77 %   | 70 %      | PASS   |

**Delta vs `main`:** new — `packages/domain/src/ai/redact.ts` and `packages/ui`'s `vitest` project did not exist before this chunk (`packages/ui` had zero tests; `apps/web`'s `jsdom` project had zero test files and `jsdom`/`@testing-library/*` were not installed).

### New Vitest suites (component tests, `packages/ui/src/primitives/*.test.tsx`, jsdom + Testing Library)

| Suite                        | Tests | Covers                                                                                                                                                   |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `money-text.test.tsx`        | 17    | Indian grouping (2,2,3) vs the ≤1-lakh western-equivalent case, Bengali numerals, `sign`, lakh/crore `compact`, bigint input, `<bdi>` + `signed` tinting |
| `status-chip.test.tsx`       | 9     | Attendance fill/ring resolution (ring only on `late`/`half_day` per §2.4), locale, generic `tone` → semantic-token classes                               |
| `bn-en-text.test.tsx`        | 9     | Script-run splitting, neutral-character attachment, Bengali-digit-as-its-own-run, numeral conversion                                                     |
| `attendance-toggle.test.tsx` | 6     | `radiogroup` named by student, `unmarked` default (D-40), click + arrow-key selection, Bengali letters                                                   |
| `mark-cell.test.tsx`         | 8     | Select-on-focus, commit on blur/Enter, clamping to `maxMarks` without blocking typing, danger state, grade chip only when in range                       |
| `period-grid.test.tsx`       | 3     | Desktop table vs phone day-tabs breakpoint switch, `aria-current="time"` on the current cell                                                             |
| `data-list.test.tsx`         | 9     | Rules-not-cards markup (D-22/2), same columns in both renderers, cursor-pagination `Load more`, virtualisation windowing                                 |
| `bottom-nav.test.tsx`        | 9     | `NavConfig` role/module/owner filtering, active-route `aria-current`, the More sheet (open, owner-only items, empty-groups → no More tab)                |

### `redactForAI()` (`packages/domain/src/ai/redact.test.ts`, 44 tests)

- Allow-list passthrough (`firstName`, `gradeLevel`), numeric coercion, null/empty dropped silently.
- Fails closed: unrecognised fields dropped without throwing.
- Hard-blocked field names throw `RedactionError` — one test per field across surname/health/religion/NID/phone/email/address/guardian/DOB/marks/studentId/document-not-syllabus (24 fields), plus a syllabus-reference exception that does _not_ throw.
- Pattern checks fire even on allowed fields: 10/13/17-digit BD NID, BD phone (`01[3-9]\d{8}`), email, and the same two after Bengali-digit normalisation (০-৯ → 0-9).
- Fails closed on malformed input shapes: string, array, null, non-string/number allowed-field value.

## Manual/visual verification

- `/design` (dev/preview-only; `notFound()`s when `VERCEL_ENV === "production"`) renders all ten primitives (`AppShell`, `TopBar`, `BottomNavFromConfig`+More sheet, `FormSheet`, `DataList`, `EmptyState`, `StatusChip`, `MoneyText`, `AttendanceToggle`, `MarkCell`, `PeriodGrid`, `BnEnText`) at 360×800 and 1280×800, axe-clean (`apps/web/e2e/design-smoke.spec.ts`).
- One real a11y regression was caught and fixed by this run, not assumed away: `PeriodGrid`'s subject badge originally paired `bg-chart-N/15` with `text-chart-N` (2.3–2.69:1, axe `color-contrast` serious) and, after the first fix, `text-muted-foreground` nested on `bg-muted` (4.34:1, still short of 4.5:1 at 11px). Final shape: a `bg-chart-N` dot (`aria-hidden`, decorative, ≥3:1 non-text) plus `text-foreground`/`text-muted-foreground`-on-`background` for the label, which is the token pair DESIGN-SYSTEM §2.3 actually measured.

## Notable deviations from the literal task text (reasoned, documented in code)

1. **`/design` route, not `/_design`.** Next.js App Router excludes any `_`-prefixed segment from routing entirely, which would make the page unreachable by Playwright. Comment in `apps/web/app/(marketing)/design/page.tsx` explains; the "must never reach production" requirement is met by the `VERCEL_ENV` guard below, not the folder name.
2. **`VERCEL_ENV === "production"` guard, not `NODE_ENV`.** `next start` (both the e2e suite's `webServer` and a real Vercel preview) always reports `NODE_ENV=production` — a `NODE_ENV` guard would 404 the page in the exact run meant to exercise it. `VERCEL_ENV` is unset outside a real Vercel deployment and is the pattern `apps/web/instrumentation.ts` already uses for the same environment distinction.
3. **`MoneyText`'s `compact` prop changes meaning** from the pre-existing "drop trailing `.00`" to the DESIGN-SYSTEM §4.13 contract's lakh/crore abbreviation (`৳12.5L`) — no callers existed yet (`grep` confirmed), so this is not a breaking change to shipped code.
4. **Full `apps/web` navigation wiring (`app/(school)/app/nav.tsx` etc.) was left as-is.** `nav-config.ts` + `BottomNavFromConfig` are built, tested and ready, but rewiring the already-shipped, role-gated school shell to consume them is feature/app-layer work with its own review surface, not primitives conformance — flagged as follow-up rather than risked in this chunk.
5. **Semgrep custom rules are wired via `.semgrep/redact-for-ai.yml`** (`--config .semgrep` added to the CI `security` job's Semgrep invocation, a one-line change) rather than a `config:` YAML list, since the existing workflow step is a shell command with `--config` flags, not YAML-list-shaped. D-26(5) (only `packages/adapters/ai` may import `@anthropic-ai/sdk`) is enforced as an eslint `no-restricted-imports` override in `packages/config/eslint.config.js` (the task's documented alternative), verified with `pnpm lint` — `packages/adapters/ai` does not exist yet, so there is nothing to import from it yet; the rule is in place ahead of that package landing.

## Not verified

- The Semgrep rules themselves were not run through the actual `semgrep` binary (Docker-based CI step; not run locally) — verified by careful reading only. They are best-effort heuristics over syntax, not a taint analysis, as their own header comment states.
- Bundle/Lighthouse budgets were not measured beyond the Next.js build's own route-size report (`/design` is dev-only and excluded from the product's shipped bundle budget by definition).

## Rebase note

This branch was cut from `chore/foundation`, which was squash-merged into `main` and deleted mid-session (PR #1). The branch was reset onto `origin/main` and all work reapplied; `git diff` against `origin/main` at time of push contains only this chunk's changes. A duplicate stash of this branch's own WIP remains on the shared stash stack (`.git/refs/stash`, message `wip: m0-ui-otel-redaction before rebase onto main`) alongside a recovered, unrelated `feat/identity-audit` WIP stash (message `recovered-audit-wip: ...`) that was accidentally popped from the shared stack and re-stashed rather than discarded — both are inert (not part of any commit) and safe to drop once their owners confirm.
