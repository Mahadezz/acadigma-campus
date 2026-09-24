# Test Report — Visual language (M0 0.9b), D-57

|         |                                                                                             |
| ------- | ------------------------------------------------------------------------------------------- |
| Feature | M0 0.9b — visual language (design tokens, not a numbered feature spec)                      |
| Part    | Ink/paper monochrome chrome from acadigma.com, JetBrains Mono                               |
| Spec    | `docs/architecture/DESIGN-SYSTEM.md` §1–§2 (this PR); `docs/decisions/DECISION-LOG.md` D-57 |
| PR      | feat(ui): visual language from acadigma.com — ink/paper tokens, JetBrains Mono (D-57)       |
| Status  | **PASS WITH KNOWN ISSUES**                                                                  |
| Date    | 2026-09-24                                                                                  |
| Run by  | Claude (Sonnet 5), builder session                                                          |

---

## 1. Scope

**What this Part is.** `packages/ui/tokens/tokens.css` and `packages/ui/globals.css` move from an indigo-primary / amber-accent / dark-navy-sidebar identity to a fully achromatic ink (`#0b0b0b`) / paper (`#f4f4f2`) chrome copied from `acadigma-website`'s `globals.css`, per the owner's instruction that Campus "looks bad, nothing like the website that you built." Attendance status colours, grade-band colours and the chart palette are untouched; `--danger`/`--destructive` is recoloured to the website's literal red. JetBrains Mono is added as `--font-mono` via `next/font`. `button`, `card`, `input` and `auth-card` move to the ink-tinted `shadow-flat` token.

**A significant, unplanned finding surfaced and was fixed in this PR** — see §1.1.

**Out of scope for this Part, by the main session's explicit instruction:**

- `packages/ui/src/primitives/bottom-nav.tsx`, `nav-config.ts`, a not-yet-existing `sidebar-from-config.tsx`, and everything under `apps/web/app/(school)/` — PR #17 (`feat/m0-wrapup`) is rewriting them concurrently. The sidebar restyle here is tokens-only; nav-specific component styling follows once #17 merges.
- `--success` / `--warning` / `--info` — left at their previously-measured hues; not mentioned in the session's colour-retention list and still needed by UI (the offline banner, toasts) this Part does not touch.
- Any CI verification — GitHub Actions is account-wide blocked as of ~13:09 today (billing issue on the owner's account); every job fails in 2–3s regardless of code. All verification below is local.

**Risk areas** — where the testing effort went:

- Whether every text/background and UI-boundary pair the new tokens create actually clears WCAG contrast, in both themes — scripted, not eyeballed (§3, §5).
- Whether the fallback theme block in `packages/ui/globals.css` (§1.1) was actually masking the real tokens — found to be yes, and fixed.
- Whether the change is visually real (not just present in the CSS source) — verified by building and screenshotting the actual rendered app, before and after, plus a `getComputedStyle` probe.

### 1.1 Unplanned finding: the fallback theme was silently overriding the real tokens, in every build

While capturing "before" screenshots from a clean build of `main` (commit `cd32ca8`) for comparison, the rendered `/design` page's primary button was near-black rather than the indigo the existing `tokens.css` specifies. `page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'))` on that build measured `oklch(20.5% 0 0)` — the stock shadcn fallback value hard-coded in `packages/ui/globals.css`'s "Fallback theme" block — not `oklch(0.472 0.19 269)` (indigo-600), which is what `packages/ui/tokens/tokens.css` actually declares.

**Root cause:** `globals.css` `@import`s `tokens.css` and then declares its own `:root`/`.dark` fallback block afterward, in the same file. An `@import`ed rule is spliced in at the import point, so in the final cascade tokens.css's plain `:root` ends up _earlier_ than the fallback `:root` that follows it textually in `globals.css`. For two unlayered rules of equal specificity, the later one wins — so the fallback was overriding every property it also declared, unconditionally, in every environment including production. The file's own comment claimed the opposite ("tokens declared there override the fallbacks below... wins by source order... if it comes later"), which was simply wrong about which rule is later.

**Fix (this PR):** the fallback `:root`/`.dark` block in `packages/ui/globals.css` now lives inside `@layer base`. CSS Cascade Layers give any unlayered rule priority over any layered rule regardless of source order, so tokens.css's real values now always win once the import resolves — which is every real build. Verified by rebuilding and re-probing: `--primary` now measures the token's actual value (`#0b0b0b` in this PR's ink/paper set) rather than the fallback.

**Why this matters beyond D-57:** this bug predates this PR and is independent of the ink/paper decision — it affected the indigo/amber/navy identity exactly the same way. It is a plausible _structural_ contributor to the owner's "looks bad" read: the shipped app was very likely rendering the generic shadcn black-on-white fallback for `--primary`/`--background`/`--sidebar-primary` etc., not the refined indigo/amber/navy system DESIGN-SYSTEM.md describes, this whole time. This PR fixes the mechanism; it does not attempt to verify what every other page looked like before the fix (out of scope — the fix makes that question moot going forward).

---

## 2. Environment

|                |                                                                                |
| -------------- | ------------------------------------------------------------------------------ |
| Commit         | HEAD of `feat/visual-language` at PR open time (see PR for the exact sha)      |
| Branch         | `feat/visual-language`                                                         |
| CI run         | **Not run** — GitHub Actions account-wide blocked (billing) as of ~13:09 today |
| Preview URL    | none (CI blocked, no Vercel preview)                                           |
| Supabase       | not used — no server/DB code touched                                           |
| Migration head | unchanged — no migration in this PR                                            |
| Seed           | not used                                                                       |
| Node / pnpm    | v24.19.0 / pnpm 10.34.5                                                        |
| Browsers       | Chromium (Playwright 1.63.0)                                                   |
| Feature flags  | none                                                                           |

---

## 3. Unit and integration (Vitest)

Full repo suite (no new unit tests were needed — this PR changes tokens, CSS class strings and a font wiring file, not logic; existing suites already cover every component that reads these tokens):

| Suite                | Tests | Passed | Failed | Skipped | Duration |
| -------------------- | ----- | ------ | ------ | ------- | -------- |
| Full `pnpm test` run | 673   | 673    | 0      | 0       | 9.59s    |
| **Total**            | 673   | 673    | 0      | 0       | 9.59s    |

49 test files, all green. No test asserts a class name, hex value or CSS custom property this PR touched — grepped for `bg-primary`, `bg-accent`, `shadow-xs`/`shadow-sm`, `indigo`, `amber-`, `sidebar-primary` across every `*.test.ts(x)`; no matches, so no test needed updating.

### Coverage

Repo-wide (unchanged by this PR — no new source lines that need coverage; `packages/ui`'s components with logic are already covered by `attendance-toggle.test.tsx`, `mark-cell.test.tsx`, `data-list.test.tsx`, etc.):

| Package   | Lines  | Branches | Functions | Result               |
| --------- | ------ | -------- | --------- | -------------------- |
| All files | 96.27% | 88.68%   | 96.11%    | unchanged vs. `main` |

**Delta vs `main`:** ~0 — this PR adds no new branching logic to `packages/ui`'s tested surface (tokens.css, globals.css and className strings are not instrumented; `scripts/check-contrast-tokens.mjs` is a standalone script, not part of the Vitest suite).

---

## 4. Database (pgTAP)

**Not applicable.** No migration, RLS policy or database code in this PR.

---

## 5. End to end (Playwright)

| Journey                                                                 | 360 × 800 | 1280 × 800 | Duration      | Notes                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | --------- | ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/design-smoke.spec.ts` — every `packages/ui` primitive on `/design` | PASS      | PASS       | 2.3–2.8s each | Ran twice: once before the §1.1 cascade fix (also passed — the fallback block happened to already carry ink/paper values, since it was restyled in this same PR), and once after, both green. |

**Flaky (passed on retry):** none.
**Report artifact:** not uploaded (no CI run — see §2); ran locally via `pnpm exec playwright test e2e/design-smoke.spec.ts` from `apps/web`, with `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the same browser-safe publishable values already committed in `.env.example` (no secret used) so `next start`'s middleware does not refuse to boot — `apps/web/.env.local` in the main checkout was not read or copied, per instruction.

### Accessibility (axe, WCAG 2.1 AA)

| Screen    | Critical | Serious | Moderate | Minor | Notes                                                         |
| --------- | -------- | ------- | -------- | ----- | ------------------------------------------------------------- |
| `/design` | 0        | 0       | 0        | 0     | `expectNoA11yViolations` — zero violations at both viewports. |

**Manual checks:**

| Check                                           | 360 × 800                                                                  | 1280 × 800 |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| Touch targets ≥ 44 px                           | unchanged by this PR (layout not touched)                                  | unchanged  |
| Visible focus ring on every interactive element | yes — `--ring` still 2px, now ink/paper (17.87:1 light, dark)              | yes        |
| No horizontal scroll                            | yes (verified in the `/design` screenshot)                                 | n/a        |
| Contrast ≥ 4.5:1 on new surfaces                | **scripted**, see §3 in the token verification below — all text pairs pass | same       |

### Contrast verification (`node scripts/check-contrast-tokens.mjs`)

Every text/background and UI-boundary pair the new tokens create, computed via WCAG 2.1 relative luminance (not estimated). Full output (21 checks, both themes, all pass):

**Light**

| Pair                                          | Ratio   | Threshold | Result                                                |
| --------------------------------------------- | ------- | --------- | ----------------------------------------------------- |
| foreground / background                       | 17.87:1 | 4.5:1     | PASS                                                  |
| card-foreground / card                        | 19.01:1 | 4.5:1     | PASS                                                  |
| popover-foreground / popover                  | 19.01:1 | 4.5:1     | PASS                                                  |
| muted-foreground / background                 | 4.56:1  | 4.5:1     | PASS                                                  |
| muted-foreground / card                       | 4.85:1  | 4.5:1     | PASS                                                  |
| primary-foreground / primary (button text)    | 17.87:1 | 4.5:1     | PASS                                                  |
| primary-ink / background                      | 17.87:1 | 4.5:1     | PASS                                                  |
| secondary-foreground / secondary              | 16.18:1 | 4.5:1     | PASS                                                  |
| accent-foreground / accent                    | 16.18:1 | 4.5:1     | PASS                                                  |
| danger-foreground / danger                    | 6.57:1  | 4.5:1     | PASS                                                  |
| danger-ink / danger-soft                      | 8.06:1  | 4.5:1     | PASS                                                  |
| sidebar-foreground / sidebar                  | 19.01:1 | 4.5:1     | PASS                                                  |
| sidebar-muted / sidebar                       | 4.85:1  | 4.5:1     | PASS                                                  |
| sidebar-primary-foreground / sidebar-primary  | 19.01:1 | 4.5:1     | PASS                                                  |
| sidebar-accent-foreground / sidebar-accent    | 16.18:1 | 4.5:1     | PASS                                                  |
| input / background (3:1 boundary)             | 3.15:1  | 3:1       | PASS                                                  |
| input / card (3:1 boundary)                   | 3.35:1  | 3:1       | PASS                                                  |
| ring / background (focus ring)                | 17.87:1 | 3:1       | PASS                                                  |
| ring / card (focus ring)                      | 19.01:1 | 3:1       | PASS                                                  |
| danger (fill) / card (icon/border use)        | 6.35:1  | 3:1       | PASS                                                  |
| border / background (hairline, informational) | 1.18:1  | —         | informational only, see §2.6 note in DESIGN-SYSTEM.md |

**Dark**

| Pair                                          | Ratio   | Threshold | Result             |
| --------------------------------------------- | ------- | --------- | ------------------ |
| foreground / background                       | 17.87:1 | 4.5:1     | PASS               |
| card-foreground / card                        | 17.01:1 | 4.5:1     | PASS               |
| popover-foreground / popover                  | 17.01:1 | 4.5:1     | PASS               |
| muted-foreground / background                 | 6.01:1  | 4.5:1     | PASS               |
| muted-foreground / card                       | 5.72:1  | 4.5:1     | PASS               |
| primary-foreground / primary (button text)    | 17.87:1 | 4.5:1     | PASS               |
| primary-ink / background                      | 17.87:1 | 4.5:1     | PASS               |
| secondary-foreground / secondary              | 15.48:1 | 4.5:1     | PASS               |
| accent-foreground / accent                    | 15.48:1 | 4.5:1     | PASS               |
| danger-foreground / danger                    | 7.06:1  | 4.5:1     | PASS               |
| danger-ink / danger-soft                      | 9.72:1  | 4.5:1     | PASS               |
| sidebar-foreground / sidebar                  | 16.43:1 | 4.5:1     | PASS               |
| sidebar-muted / sidebar                       | 5.52:1  | 4.5:1     | PASS               |
| sidebar-primary-foreground / sidebar-primary  | 17.87:1 | 4.5:1     | PASS               |
| sidebar-accent-foreground / sidebar-accent    | 14.10:1 | 4.5:1     | PASS               |
| input / background (3:1 boundary)             | 3.69:1  | 3:1       | PASS               |
| input / card (3:1 boundary)                   | 3.52:1  | 3:1       | PASS               |
| ring / background (focus ring)                | 17.87:1 | 3:1       | PASS               |
| ring / card (focus ring)                      | 17.01:1 | 3:1       | PASS               |
| danger (fill) / card (icon/border use)        | 6.72:1  | 3:1       | PASS               |
| border / background (hairline, informational) | 1.25:1  | —         | informational only |

`--input` deliberately deviates from acadigma-website's literal `#d6d6d2` (which measures 1.32:1/1.54:1 — below 3:1) to clear WCAG 1.4.11 for an unfocused form field's own boundary; see DECISION-LOG D-57 and the tokens.css comment at `--input`.

### Screenshots

Before = a clean build of `main` @ `cd32ca8` (the commit this branch forked from). After = this branch. All under `docs/test-reports/assets/2026-09-24-visual-language/`.

| Screen           | 360 × 800                                                     | 1280 × 800                                                     |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `/design` before | `assets/2026-09-24-visual-language/before-design-360x800.png` | `assets/2026-09-24-visual-language/before-design-1280x800.png` |
| `/design` after  | `assets/2026-09-24-visual-language/after-design-360x800.png`  | `assets/2026-09-24-visual-language/after-design-1280x800.png`  |
| `/login` before  | `assets/2026-09-24-visual-language/before-login-360x800.png`  | `assets/2026-09-24-visual-language/before-login-1280x800.png`  |
| `/login` after   | `assets/2026-09-24-visual-language/after-login-360x800.png`   | `assets/2026-09-24-visual-language/after-login-1280x800.png`   |

**Reading the before/after pair honestly:** because of the §1.1 cascade bug, the "before" screenshots already show a near-black/white look, not the indigo/amber/navy DESIGN-SYSTEM.md describes — the bug was masking that identity before this PR too. The real, visible difference this PR makes is smaller than "indigo → ink" in the screenshots (both are already achromatic), but is genuine: the _intended_ token values now match what's rendered (provable — see the `getComputedStyle` probe in §1.1), `--input`'s boundary is now deliberately visible and WCAG-compliant, shadows are ink-tinted, radius steps moved, and `--danger` now matches acadigma-website's literal red rather than an independently-derived one. The `/login` and `/design` pages were already close to ink/paper by accident; a page that used `--sidebar-primary` (amber before this PR, in the token source though never rendered) or `--accent` for actual amber decoration would have shown the retirement of that pattern more visibly, but no such page exists in this repo yet outside `apps/web/app/(school)/`, which is out of scope.

<!-- Synthetic /design placeholder data only. No real student, guardian or staff data. -->

---

## 6. Performance

| Budget                                   | Target      | Measured                     | Result                                                                                                                           |
| ---------------------------------------- | ----------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| First-load JS, `/(school)/app`           | ≤ 200 KB gz | 183 KB                       | PASS                                                                                                                             |
| First-load JS, `/(school)/app/dashboard` | ≤ 200 KB gz | 183 KB                       | PASS                                                                                                                             |
| First-load JS, `/(school)/app/audit`     | ≤ 200 KB gz | 221 KB                       | pre-existing, unrelated to this PR (`node scripts/check-bundle-budget.mjs` does not fail the build on it; not investigated here) |
| `pnpm --filter @acadigma/web build`      | succeeds    | succeeds, 18/18 static pages | PASS                                                                                                                             |

Lighthouse was not run (no CI, no `next dev`/`next start` warm profiling session set up for it locally in the time available) — **not run**.

---

## 7. Security checks

| Check                           | Result                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------- |
| gitleaks                        | **not run** — not installed locally, and CI (which runs it) is blocked          |
| Semgrep (ERROR severity)        | **not run** — same reason                                                       |
| `pnpm audit --audit-level high` | **not run** — this PR added no dependency; deferred to CI once billing is fixed |
| Supabase advisors               | not applicable — no schema change                                               |
| Authorized DAST                 | not applicable — no auth/money/file code changed                                |

This PR touches only CSS custom properties, className strings, a font-loading file and documentation. No new attack surface.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                      | Severity                 | Ship anyway?                                                                                                                          | Tracked                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Nav-specific component styling (bottom nav, sidebar-from-config, `(school)` routes) still carries whatever they carried before — only their _tokens_ changed. A screen that renders the sidebar will look inconsistent with the rest of the app's ink/paper chrome until #17 merges and a follow-up Part restyles those components.                        | medium                   | yes — explicit, instructed scope boundary for this PR                                                                                 | follow-up Part after #17          |
| 2   | `--success`/`--warning`/`--info` were left at their previously-measured hues, not moved toward monochrome. If the owner wants those retired too (matching `--accent`'s treatment), that is a new decision, not assumed here.                                                                                                                               | low                      | yes — deliberate, documented in DECISION-LOG D-57                                                                                     | none yet — raise if wanted        |
| 3   | CI could not run at all (GitHub Actions account-wide blocked by a billing issue, independent of this PR). Every gate below was run locally instead: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, every `node scripts/check-*.mjs`, `pnpm --filter @acadigma/web build` — all green, see this report. | high (process, not code) | yes — the owner was told not to keep polling CI; this PR should be reviewed on the local evidence and CI re-run once billing is fixed | owner action: fix Actions billing |
| 4   | Lighthouse and gitleaks/Semgrep were not run locally (tooling/time).                                                                                                                                                                                                                                                                                       | low                      | yes — no code change in this PR plausibly triggers either                                                                             | CI, once unblocked                |

**Deliberately not tested, and why:**

- Dark mode was verified by token/contrast computation and by the `.dark` class existing correctly in the same file structure as `:root`, but no dark-mode screenshot was captured (the plan named `/design` and `/login`, both captured in light mode as the default `prefers-color-scheme`; a full light+dark screenshot matrix was judged lower priority than the contrast script, which mathematically covers dark mode already).
- The `(school)` app shell, sidebar and bottom nav were not screenshotted — out of scope per the PR's explicit file boundary.

---

## 9. Sign-off

| Definition of Done                           | Met                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Spec written and matches the build           | ☑ — DESIGN-SYSTEM.md §1/§2 updated in this PR, D-57 in DECISION-LOG.md               |
| Migration + pgTAP isolation and escalation   | n/a — no schema change                                                               |
| Unit tests + coverage thresholds             | ☑ — 673/673 passing, coverage unchanged                                              |
| UI built and verified at both viewports      | ☑ — screenshots + design-smoke spec at 360×800 and 1280×800                          |
| Playwright journey at both viewports         | ☑ — `design-smoke.spec.ts`, axe clean                                                |
| a11y — zero serious/critical + manual checks | ☑                                                                                    |
| This test report, with real numbers          | ☑                                                                                    |
| Docs updated in the same PR                  | ☑ — DESIGN-SYSTEM.md, DECISION-LOG.md, tokens/README.md, this report, docs/README.md |

**Signed off by:** Claude (Sonnet 5), builder session
**Date:** 2026-09-24
**Commit:** HEAD of `feat/visual-language` at PR open time

> I ran these tests and read their output myself; the numbers above are copied from real local runs. CI did not run — GitHub Actions is account-wide blocked by a billing issue unrelated to this PR, confirmed by the coordinating session, not assumed. §1.1's cascade-layer bug is real and independently reproduced (before: `oklch(20.5% 0 0)`; after the fix: the intended token value) — it is not a guess.
