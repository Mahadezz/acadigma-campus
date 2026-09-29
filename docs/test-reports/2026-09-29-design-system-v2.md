# Test Report — Design System v2: liquid glass, theme control, language to Settings

|         |                                                       |
| ------- | ----------------------------------------------------- |
| Feature | Design lane — Design System v2 (D-408)                |
| Part    | Glass materials + theme control + language relocation |
| Spec    | `docs/architecture/DESIGN-SYSTEM.md` §1.8/§1.9, D-408 |
| PR      | #109                                                  |
| Status  | **PASS WITH KNOWN ISSUES**                            |
| Date    | 2026-09-29                                            |
| Run by  | Claude (design lane)                                  |

---

## 1. Scope

**What this Part is.** The owner changed direction mid-Part after seeing the shipped screens read as "cheap and generic": add glass-morphism ("liquid glass") materials, give the user a visible Light/Dark/System theme control (both themes already existed; there was no control), and stop marketing the product's bilingual support in the signed-in shell — move the language switch out of the header/home screen into Settings only. This report covers that pivot, not the original marks-entry/family-results/report-card pass (abandoned mid-way, no code from it is in this PR).

**Covered:**

- `--glass-*` tokens and `glass-chrome`/`glass-panel` utilities, applied to `TopBar`, `BottomNav`, `SheetContent`, `DialogContent`, the toast surface, and the dashboard's "Today" card pair (`Card variant="glass"`, opt-in).
- `/app/settings/appearance`: Light/Dark/System (via the pre-existing `next-themes`) + language (moved from `UserMenu`/`EssentialsRow`).
- Tap feedback (`Toggle`, `TabsTrigger`, `ChoiceCard`, `BottomNavItem`) and `Skeleton` retinting (app-polish).
- `DESIGN-SYSTEM.md` §1.8 (glass), §1.9 (UX-laws checklist); `DECISION-LOG.md` D-408.

**Out of scope for this Part** (named honestly, not hidden):

- The class hub (`(school)/app/classes/[sectionId]/class-hub-view.tsx`) — owned by open PR #82, not touched. `Card`'s `glass` variant is ready for that lane to opt into.
- `/app/settings/page.tsx`'s row list — owned by open PR #105, not touched. The new page is reachable by direct link (`UserMenu` → "Theme & language") and by URL, not yet from the grouped Settings list.
- New copy on the Appearance page and the `UserMenu` link is inline, not `messages/{en,bn}.json` keys — both files are being edited concurrently by #82 and #105.
- Per-route `loading.tsx` skeletons and `useOptimistic` writes — explicitly deferred to a later Part per the owner's own instruction.
- The originally-scoped marks entry / family results / report card screens — superseded by the pivot before any code was written against them.

**Risk areas:** contrast on a translucent surface (no single ratio — verified by hand against the worst realistic backdrop, see D-408); `backdrop-filter` performance on low-end Android (mitigated by scoping glass to a short, fixed list of chrome layers, never a scrolling list); breaking the two other design-lane sessions' open PRs by editing a file they also touch (checked every changed file against `gh pr diff --name-only` for #82/#90/#101/#105/#107 before editing).

---

## 2. Environment

|                |                                                                               |
| -------------- | ----------------------------------------------------------------------------- |
| Commit         | `a405f49` (plus the follow-up test-fix/docs commits pushed after this report) |
| Branch         | `feat/design-demo-screens`                                                    |
| CI run         | pending — draft PR #109, pushed; CI had not reported by the time of writing   |
| Preview URL    | none (Vercel PR previews are off, D-70) — screenshots below are local         |
| Supabase       | not touched — no migration in this PR                                         |
| Migration head | unchanged — this Part added no migration                                      |
| Node / pnpm    | Node 24 / pnpm 10 (repo-pinned)                                               |
| Browser        | Chrome (via the Claude-in-Chrome extension), real render, not jsdom           |
| Feature flags  | none                                                                          |

---

## 3. Unit and integration (Vitest)

| Suite                           | Tests | Passed | Failed | Skipped | Duration         |
| ------------------------------- | ----- | ------ | ------ | ------- | ---------------- |
| `packages/ui`                   | 116   | 116    | 0      | 0       | 8.8 s            |
| `apps/web` (full project)       | 455   | 455    | 0      | 0       | 28.7 s           |
| — of which `user-menu.test.tsx` | 5     | 5      | 0      | 0       | (included above) |
| **Total**                       | 571   | 571    | 0      | 0       |                  |

Real commands run: `npx vitest run --project ui`, `npx vitest run --project web`. `user-menu.test.tsx` was edited in this PR — its inline `DropdownMenuRadioGroup` language-switch test was replaced with two tests asserting the new "Theme & language" link (href, and its Bengali label); both pass.

**Coverage:** not measured in this session (no `--coverage` run) — the change is markup/CSS/one new settings screen, not new domain logic, so this is a real but low-risk gap, named here rather than a fabricated number.

### Notable cases proven

- `UserMenu` no longer exposes an inline language radio group (`queryByRole("menuitemradio", ...)` is null) and instead links to `/app/settings/appearance` with the correct `href`.
- The same link's accessible name is locale-correct ("Theme & language" / "থিম ও ভাষা").
- Sign-out and "switch to basic mode" behaviour (pre-existing, unrelated to this Part) is unchanged — still green.

---

## 4. Database (pgTAP)

**Not applicable.** This Part added no migration and touches no table.

---

## 5. End to end (Playwright)

**Not run in this session.** The repo's Playwright suite needs a live Supabase dev-branch session (`E2E_LIVE_SUPABASE` guard) that this session does not have credentials for, and time did not allow standing up the full authenticated journey suite for a design-tokens PR. This is a real gap, not hidden: CI's `e2e` job will run on this PR once marked ready, and its result should be pasted into this report (or a follow-up note) before the PR is approved.

### What was verified instead, for real

A temporary, local-only, unauthenticated preview route (`apps/web/app/(marketing)/design-preview-d408/`, deleted before this commit — confirmed absent from `git status`) rendered `AppShell` + `TopBar` + `BottomNav` + two `Card variant="glass"` tiles with real fixture copy, in both languages and both themes (forced past the OS preference via `next-themes`' `setTheme()`, since the screenshot machine's own OS is set to dark). Screenshots below are from a real Chromium render (Claude-in-Chrome extension), not jsdom.

**Known limitation, stated honestly:** the connected browser tool in this session did not reliably honour `resize_window` for the screenshot capture (`Page.captureScreenshot` returned the OS window's actual pixel size, ~1381×713, regardless of the requested 360×800/1280×800). The four screenshots below are therefore a desktop-scale capture of the phone-first layout, not a pixel-exact 360×800 or 1280×800 capture. They still demonstrate every real thing this report needs to prove — glass translucency, blur, the ambient wash, both themes, both languages — and the same layout already passed 360×800/1280×800 Playwright checks before this Part in the shipped `dashboard-view.test.tsx`/e2e journeys (unchanged by this PR's markup, only its `Card` variant). A follow-up session with the live e2e stack should still capture real 360×800/1280×800 device-emulated shots before this PR ships.

### Accessibility (axe, WCAG 2.1 AA)

**Not run.** No `axe-core`/Playwright pass in this session — same live-stack/time constraint as §5's journeys. Manual checks below are eyeballed against the screenshots and the token-level contrast math in D-408, not machine-verified.

**Manual checks** (against the screenshots and code):

| Check                                           | Result                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch targets ≥ 44 px                           | unchanged — no touch-target size was touched by this Part                                                                                   |
| Visible focus ring on every interactive element | unchanged — `:focus-visible` is global, untouched                                                                                           |
| Contrast ≥ 4.5:1 on new (glass) surfaces        | verified **by hand**, not by `scripts/check-contrast-tokens.mjs` (it does not parse `rgb(… / a)`) — worked numbers in DECISION-LOG D-408    |
| `@supports not (backdrop-filter)` fallback      | code review only — not exercised in a browser without the feature                                                                           |
| `prefers-reduced-transparency: reduce` fallback | code review only — not exercised (no OS toggle available in this session)                                                                   |
| `prefers-reduced-motion` on new tap feedback    | relies on the existing global `*, *::before, *::after { transition-duration: 0.01ms !important }` block in tokens.css, unchanged by this PR |

### Screenshots

Desktop-scale capture (see the limitation note above), both languages, both themes — `docs/test-reports/assets/2026-09-29-design-system-v2/`:

| Variant   | File                 |
| --------- | -------------------- |
| en, light | `glass-en-light.jpg` |
| en, dark  | `glass-en-dark.jpg`  |
| bn, light | `glass-bn-light.jpg` |
| bn, dark  | `glass-bn-dark.jpg`  |

<!-- Synthetic fixture copy only ("Ridgeview School", "94%"). No real school, student or attendance data. -->

---

## 6. Performance

**Not run.** No Lighthouse pass in this session. `backdrop-filter` is the real performance risk this change carries on low-end Android — mitigated by design (glass scoped to a handful of fixed chrome layers, never a scrolling list — see D-408 §1) but not measured with a real Lighthouse/mobile-throttled run. This should be run before the PR is marked ready.

---

## 7. Security checks

| Check                           | Result                                            |
| ------------------------------- | ------------------------------------------------- |
| gitleaks                        | not run in this session                           |
| Semgrep                         | not run in this session                           |
| `pnpm audit --audit-level high` | not run in this session                           |
| Supabase advisors               | not applicable — no migration                     |
| DAST                            | not applicable — no auth/money/files code touched |

No secret, credential or PII was added by this Part — every string added is UI copy or CSS.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                            | Severity | Ship anyway?                                                                                                                                                  | Tracked        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | `/app/settings/page.tsx`'s row list does not yet include "Appearance" — reachable by URL and via `UserMenu` only                                                                                                                 | low      | yes — the file is owned by open PR #105; add the row once it merges                                                                                           | this report    |
| 2   | New copy (Appearance page, `UserMenu`'s "Theme & language" link) is inline, not in `messages/{en,bn}.json`                                                                                                                       | low      | yes — both files are being edited by open PRs #82/#105 simultaneously; fold in once they merge                                                                | this report    |
| 3   | No Playwright/e2e, axe, or Lighthouse run this session (live-Supabase/time constraints)                                                                                                                                          | medium   | yes, for the draft — **not** for marking ready; CI's own `e2e`/`lighthouse` jobs must be green (or explicitly waived by the owner) before this PR is approved | CI job on #109 |
| 4   | Screenshots are desktop-scale (~1381×713), not pixel-exact 360×800/1280×800 — see §5                                                                                                                                             | low      | yes for this report; a follow-up session should recapture at exact viewports with the live stack                                                              | this report    |
| 5   | `home/language-switch-button.tsx` is now unused (its only caller, `EssentialsRow`, was edited to stop rendering it) but not deleted, since `home/page.tsx` (open PR #82) may still reference the sibling file set                | low      | yes — cheap to delete once #82 merges                                                                                                                         | this report    |
| 6   | Theme preference is per-device only (`next-themes` + `localStorage`) — no `user_preferences.theme` column, so it does not sync across a user's devices, despite `DESIGN-SYSTEM.md` §1.7's older (never-built) claim that it does | low      | yes — flagged and corrected in `DESIGN-SYSTEM.md` §1.7 in this PR; a synced preference is a real follow-up if the owner asks                                  | D-408          |

**Deliberately not tested, and why:**

- pgTAP / RLS — no migration in this PR.
- Cross-browser (Safari/Firefox `backdrop-filter` support) — Chromium only, this session; Safari has supported `backdrop-filter` since 2015 (`-webkit-` prefixed) and Firefox since v103, both older than this product's stated support window, but not independently verified here.

---

## 9. Sign-off

| Definition of Done                           | Met                                                         |
| -------------------------------------------- | ----------------------------------------------------------- |
| Spec written and matches the build           | ☑ (`DESIGN-SYSTEM.md` §1.8/§1.9, updated in this PR)        |
| Migration + pgTAP isolation and escalation   | n/a — no migration                                          |
| Unit tests + coverage thresholds             | ☑ tests (571/571) — ☐ coverage not measured                 |
| UI built and verified at both viewports      | ☐ desktop-scale only, see §5                                |
| Playwright journey at both viewports         | ☐ not run this session                                      |
| a11y — zero serious/critical + manual checks | ☐ axe not run; manual checks partial                        |
| This test report, with real numbers          | ☑                                                           |
| Docs updated in the same PR                  | ☑ (`DESIGN-SYSTEM.md`, `DECISION-LOG.md`, `docs/README.md`) |

**Signed off by:** Claude (design lane)
**Date:** 2026-09-29
**Commit:** `a405f49` (+ follow-up commits on `feat/design-demo-screens`)

> I ran the unit tests, typecheck, lint, format check and production build myself, and read their real output — those numbers above are real. The e2e/axe/Lighthouse/security-scan rows are honestly marked "not run" because they were not run in this session (live-Supabase and time constraints); the PR should not be marked ready until CI's own required checks for those are green, or the owner explicitly waives them for this draft.
