# Test Report — Design pass, `/app/dashboard` (D-407)

|         |                                                                    |
| ------- | ------------------------------------------------------------------ |
| Feature | Design lane (4) — design pass on a shipped screen, dashboard first |
| Part    | `docs/plan/LANES.md` queue: "design passes on shipped screens"     |
| Spec    | `DECISION-LOG.md` D-407; `DESIGN-SYSTEM.md` §1.6, §8.1, §8.2       |
| PR      | #102                                                               |
| Status  | **PASS WITH KNOWN ISSUES**                                         |
| Date    | 2026-09-29                                                         |
| Run by  | Claude (design lane builder)                                       |

---

## 1. Scope

**What this Part is.** The first pass in the design lane's "design passes on shipped screens" queue item, on `/app/dashboard` (D-400). Two findings, both fixed:

1. **Real bug.** `apps/web/app/(school)/app/dashboard/error.tsx` rendered hardcoded English strings ("Something went wrong", "Try again") even though its own docstring says it follows "the same copy and digest rule as the app-wide `error.tsx`" — which does read the locale. A Bengali-reading user whose dashboard failed to load saw English. Fixed by reusing `errors.appError` via `getClientLocale()`, identical to the app-wide boundary.
2. **Design-system compliance.** The screen carried 5 `eyebrow`-styled labels (page date, "Today", "Setup", "People", "Activity") against `DESIGN-SYSTEM.md` §8.1's explicit "One per screen at most, and usually none." 3 of the 4 section eyebrows duplicated their card's own `<h3>` title and are removed; "Today" (labels 2 cards with no shared title) becomes a plain `<h3>` instead of eyebrow styling. §1.6 is amended to point at the §8.1 ceiling.

**Out of scope for this Part:** any other shipped screen (next design pass picks the next one per the queue); the TopBar subtitle truncation at 360px, already flagged low-severity/ship-anyway in the original D-400 report and inherent to a 360px width with a workspace switcher — not a new finding; `packages/ui` component-level changes (none needed here, D-68's tokens already apply).

**Risk areas:** the eyebrow removal touches `aria-labelledby` wiring for 3 sections — verified none of the removed `<p>` elements were the `aria-labelledby` target (all three already pointed at the sibling `<h3>`); the i18n key rename (`eyebrowToday` → `sectionToday`) — verified no other file referenced the removed/renamed keys before deleting them.

---

## 2. Environment

|             |                                                    |
| ----------- | -------------------------------------------------- |
| Commit      | `7c1d189` (WIP; final sha in the PR head at ready) |
| Branch      | `feat/design-dashboard-pass`                       |
| CI run      | pending — see PR #102 checks                       |
| Supabase    | not used — see §5 note                             |
| Node / pnpm | v24.19.0 / 10.34.5                                 |
| Browsers    | Chromium (Playwright 1.63.0)                       |

---

## 3. Unit and integration (Vitest)

Full `pnpm test` (local, this branch): **163 test files passed, 7 skipped (170 total); 1660 tests passed, 20 skipped (1680 total). 0 failed.** `dashboard-view.test.tsx` is included and unchanged (its assertions target visible text and ARIA region names via the sibling `<h3>`, not the removed eyebrow paragraphs or the renamed key) and passed.

Coverage (full run): statements 87.36 %, branches 78.22 %, functions 86.83 %, lines 90 % — unchanged in shape from `main`, this Part added no new source lines needing new tests (a deletion + a rename + a locale-source swap already covered by the existing suite).

### Notable cases proven (pre-existing, re-verified green)

- Owner sees plan, setup checklist, people, activity; teacher gets the lighter view — `dashboard-view.test.tsx`.
- Bengali renders from the same message shape, Western digits inside Bengali copy — same file.
- A step without a page does not link — same file.

---

## 4. Database (pgTAP)

Not applicable — no migration, no schema, function or grant touched.

---

## 5. End to end and accessibility

**Live-Supabase Playwright journeys (`school-dashboard.spec.ts`) were not run locally.** This session's sandbox denies read/copy access to `.env.local` (the file that carries `NEXT_PUBLIC_SUPABASE_URL`/the publishable key for the dev branch), so `next start`/`next dev` cannot authenticate against the live project from this machine. This is an environment restriction, not a decision to skip; CI carries these as repository secrets and runs the same skip-gated journeys (`E2E_LIVE_SUPABASE=1`) for real — see the PR's CI `e2e` job for the live result.

**What was verified instead, for real:** `DashboardView` is presentational-only by design (its own docstring: "`page.tsx` reads the data and hands over finished values, so this renders the same for a test fixture as for the live school"), so it was screenshotted and axe-tested standalone — same component, same fixture data as `dashboard-view.test.tsx`'s `BASE`, rendered through a real browser (`next dev` on port 3104, a temporary local-only preview route, deleted before this PR was pushed — confirmed absent from `git status`) rather than jsdom, so real layout, contrast and axe rules actually ran:

| Screen (fixture) | Viewport   | axe violations (WCAG 2.1 A/AA) |
| ---------------- | ---------- | ------------------------------ |
| Dashboard, en    | 360 × 800  | **0**                          |
| Dashboard, en    | 1280 × 800 | **0**                          |
| Dashboard, bn    | 360 × 800  | **0**                          |
| Dashboard, bn    | 1280 × 800 | **0**                          |

### Manual checks

| Check                                  | 360 × 800                                            | 1280 × 800 |
| -------------------------------------- | ---------------------------------------------------- | ---------- |
| One eyebrow on the whole screen        | yes                                                  | yes        |
| Checklist links open ≥ 44 px tall rows | yes (min-h-12 = 48px)                                | yes        |
| Contrast (ink on paper, D-57 tokens)   | unchanged — D-57's measured tokens, not touched here | same       |
| No horizontal scroll                   | yes                                                  | n/a        |

### Screenshots

Fixture-rendered (see note above), full page:

| Screen  | 360 × 800                                    | 1280 × 800                                    |
| ------- | -------------------------------------------- | --------------------------------------------- |
| English | [view](assets/d407/dashboard-en-360x800.png) | [view](assets/d407/dashboard-en-1280x800.png) |
| Bengali | [view](assets/d407/dashboard-bn-360x800.png) | [view](assets/d407/dashboard-bn-1280x800.png) |

<!-- Synthetic fixture data only (Acadigma Demo School, made-up counts) — same fixture as dashboard-view.test.tsx. Never a real name, phone number, ID number or medical detail. -->

---

## 6. Performance

| Budget                                 | Target      | Measured      | Result |
| -------------------------------------- | ----------- | ------------- | ------ |
| First-load JS, `/app/dashboard`        | ≤ 250 kB gz | 196 kB gz     | PASS   |
| `check-bundle-budget.mjs` (all routes) | pass        | pass (exit 0) | PASS   |

Lighthouse and server-action-latency budgets were not measured — no server action or route change in this Part; the only runtime change (`error.tsx`) is a client-side error boundary with no data fetch.

---

## 7. Security checks

| Check                                    | Result                                      |
| ---------------------------------------- | ------------------------------------------- |
| No new dependency, secret, or write path | n/a — text/markup only                      |
| `pnpm audit --audit-level high`          | not run this session (no dependency change) |
| Supabase advisors                        | n/a — no schema/RLS change                  |

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                       | Severity | Ship anyway?                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Live-Supabase Playwright journey and its axe pass were not run locally (sandbox blocks `.env.local`); relying on CI's `e2e` job, which holds the real credentials as a repo secret.                                                                                                                                         | medium   | yes — the component is presentational-only and was verified with real Chromium + axe against the same fixture the unit test uses |
| 2   | The fixture-rendered screenshots were captured with `next dev`, which shows a small fixed "N" dev-tools badge in the bottom-left corner (visible in the 360×800 shots, overlapping the first checklist row). It is a Next.js dev-mode artifact, absent from any production build (`next start`/Vercel) — not a product bug. | low      | yes                                                                                                                              |
| 3   | The other shipped screens (class hub, home, attendance, students, …) have not had this same pass yet — next in the design lane's queue, one at a time per CLAUDE.md.                                                                                                                                                        | low      | yes — tracked as the design lane's ongoing queue                                                                                 |

**Deliberately not tested:** dark mode (no token changed in this Part — D-57's dark-mode measurements are untouched); the `/design` review page (not part of the dashboard).

---

## 9. Sign-off

| Definition of Done                              | Met                                                           |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Decision written (D-407) and design doc updated | ☑                                                             |
| Migration + pgTAP                               | n/a                                                           |
| Unit tests (full suite, incl. `dashboard-view`) | ☑ 1660/1680 passed, 0 failed                                  |
| UI at 360 and 1280, both languages              | ☑ (fixture-rendered, see §5)                                  |
| Playwright journey                              | written pre-existing; live run pending CI (see known issue 1) |
| axe — zero violations (fixture-rendered)        | ☑                                                             |
| This report, real numbers                       | ☑                                                             |

> I ran these tests or read their output myself. The numbers above are copied from real runs. The one caveat the owner should know: the live-Supabase e2e journey could not be run from this sandboxed session (no access to the dev branch's `.env.local`) — CI's `e2e` job is the real check for that, and this PR should not be merged until it is green.
