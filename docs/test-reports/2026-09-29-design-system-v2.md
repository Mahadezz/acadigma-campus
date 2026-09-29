# Test Report — Design System v2: liquid glass, theme control, shell back

|         |                                                                                      |
| ------- | ------------------------------------------------------------------------------------ |
| Feature | Design lane: Design System v2 (D-408)                                                |
| Part    | Glass on an ambient mesh, theme control, language to Settings, shell back affordance |
| Spec    | `docs/architecture/DESIGN-SYSTEM.md` §1.8, §1.9, §3.1; D-408                         |
| PR      | #109                                                                                 |
| Status  | **PASS WITH KNOWN ISSUES** (CI e2e/lighthouse results pending, §5)                   |
| Date    | 2026-09-29                                                                           |
| Run by  | Claude (design lane, second pass)                                                    |

---

## 1. Scope

The owner asked for liquid glass and both themes: _"the UI that you are building looked so cheap and generic use glass morphism liquid glass things that looks great also introduce a white theme as well so dark and white theme both"_. The first pass produced flat opaque cards (its screenshots are replaced below). This second pass redid the visual layer. The owner then added a request for a back control: _"there are no going back options… I want a going back thing… from both pc and phone and tablets… optimize it for phone"_.

**Covered:**

- The ambient mesh plus grain behind `AppShell`, and three glass tints (`glass-chrome`, `glass-panel`, `glass-overlay`) with fallbacks.
- Vibrancy ink (`--glass-muted-foreground`) and the new contrast script.
- The app shell: glass header, floating glass BottomNav (a centred dock from `md`), glass sidebar, sentence-case group labels.
- The dashboard: every card glass, icon chips, one big number per card, a progress bar, the date eyebrow removed, one primary action (sticky in the phone thumb zone, header right on desktop), and a tablet two-column side area.
- Settings → Appearance: theme tiles with previews and a glass language card, `aria-labelledby` on both radio groups, and no "System" flash before mount.
- Sheets, dialogs and toasts on `glass-overlay` with an 18px radius.
- The shell back affordance (`back-route.ts`, `shell-back.tsx`, wired through `WorkspaceSwitcher`) in the school, family and personal shells. `SubPageHeader`'s duplicate back link is removed.

**Not covered, on purpose:** the class hub, the attendance card and the school layout (owned by open PR #82); `settings/page.tsx` and `messages/*.json` (owned by #110 and #82); `ci.yml` (owned by #90). Their in-page back links are kept (see §8).

**Risk areas:** contrast on translucent surfaces (measured, §6); `backdrop-filter` cost on low-end Android (glass is used only on the chrome and a screen's handful of cards, never on list rows); back behaviour after a deep link (unit-tested, §3).

---

## 2. Environment

|             |                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit      | `c05ba2a3` plus this docs commit                                                                                                                                                                         |
| Branch      | `feat/design-demo-screens` (merged with `origin/main` at `f47e1515`, #105)                                                                                                                               |
| CI run      | pending at the time of writing; see the PR checks                                                                                                                                                        |
| Supabase    | not touched; no migration                                                                                                                                                                                |
| Node / pnpm | Node 24.19 / pnpm 10                                                                                                                                                                                     |
| Browser     | Installed Google Chrome via Playwright `channel: "chrome"`, headless                                                                                                                                     |
| Screens     | a temporary fixture route rendering the real `AppShell`/`TopBar`/`SchoolSidebar`/`SchoolBottomNav`/`DashboardView`/`AppearanceForm`/`ShellBack` with invented copy. The route was deleted before commit. |

---

## 3. Unit and integration (Vitest)

| Suite                          | Files | Tests | Passed | Failed | Duration |
| ------------------------------ | ----- | ----- | ------ | ------ | -------- |
| `packages/ui` (`--project ui`) | 14    | 116   | 116    | 0      | 10.0 s   |
| `apps/web` (`--project web`)   | 61    | 489   | 489    | 0      | 31.2 s   |

New or changed in this pass:

- `lib/back-route.test.ts`: top-level pages get no back; a nested nav destination (Team & access) goes up to Staff; unnamed intermediate segments are skipped; every real `page.tsx` resolves to a parent that is a real page; `navLabel` names a nav destination from the member's config.
- `(shared)/workspace/shell-back.test.ts`: A→B→A→B through Links counts as four visits, and only `popstate` steps back.
- `workspace-switcher.test.tsx`: no back on `/app/dashboard`; on `/app/exams/e1/results` there is a "Back to Exam" link to `/app/exams/e1`; on `/app/exams/e1` the name "Back to Exams" arrives after the lazy nav-config load.
- `dashboard-view.test.tsx`: zero eyebrows; the attendance progress bar is named "3 of 5 classes marked"; the primary action appears only with `attendanceHref`.
- `test/page-routes.ts`: the page-route scan moved out of `implemented-routes.test.ts`, which now shares it.

Also run: `pnpm typecheck` (6/6 tasks), `pnpm lint` (clean), `pnpm format:check` (clean), `node scripts/check-contrast-tokens.mjs` (ALL CHECKS PASS), `node scripts/check-docs-sync.mjs` (pass). Coverage was not measured this session.

---

## 4. Database (pgTAP)

Not applicable: no migration, no table.

---

## 5. End to end, accessibility, screenshots

**Playwright journeys:** not run locally. The journeys need a live Supabase session, and reading `.env.local` is blocked in this environment. CI's `e2e` job runs them on #109. The journeys that click in-page "Back to the exam" links are unaffected, because those links are kept and the shell link's name is "Back to Exam(s)".

**axe (WCAG 2.0/2.1 A+AA, `@axe-core/playwright` 4.13):** 10 runs on the fixture route, covering light/dark × 360×800/1280×800 × dashboard/appearance, plus the open More sheet at 360:

| Result                        | Count                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Violations (any impact)       | **0** in all 10 runs                                                                                                                         |
| Serious / critical            | **0**                                                                                                                                        |
| `color-contrast` "incomplete" | 0 on the dashboard and Appearance; 2 (light) and 3 (dark) with the More sheet open (page content behind the scrim, which axe cannot resolve) |

**Screenshots** are exact viewports at DPR 2 in real Chrome, under `docs/test-reports/assets/2026-09-29-design-system-v2/`:

| Screen                                    | Light                                               | Dark                                               |
| ----------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Dashboard, 360×800                        | `glass-dashboard-light-phone.jpg`                   | `glass-dashboard-dark-phone.jpg`                   |
| Dashboard, 820×1180 (tablet)              | `glass-dashboard-light-tablet.jpg`                  | `glass-dashboard-dark-tablet.jpg`                  |
| Dashboard, 1280×800                       | `glass-dashboard-light-desktop.jpg`                 | `glass-dashboard-dark-desktop.jpg`                 |
| Dashboard scrolled (header blur), 360     | `glass-scrolled-light-phone.jpg`                    | `glass-scrolled-dark-phone.jpg`                    |
| More sheet, 360                           | `glass-more-light-phone.jpg`                        | `glass-more-dark-phone.jpg`                        |
| Toast, 360                                | `glass-toast-light-phone.jpg`                       | `glass-toast-dark-phone.jpg`                       |
| Appearance + shell back, 360 / 820 / 1280 | `glass-appearance-light-{phone,tablet,desktop}.jpg` | `glass-appearance-dark-{phone,tablet,desktop}.jpg` |

<!-- Invented fixture copy only ("Ridgeview High School", names in the activity feed). No real school or person. -->

**Iteration log.** There were six rounds of screenshots, each read and criticised before the next change:

1. The mesh was too faint and the glass read as opaque.
2. Lighter tints and vibrancy ink made the glass visible; a bare-mesh contrast failure was found and fixed.
3. Scrolled content ghosted through the header, so the chrome tint went up to 72 %.
4. That ghosting turned out to come from Playwright's bundled headless shell, which does not run `backdrop-filter` at DPR 2. The installed Chrome blurs correctly, so all later shots use it.
5. Back affordance added; the tablet nav and CTA spanned 820 px, so a centred dock was added.
6. The tablet Plan card stretched to its neighbour's height, so it was top-aligned.

---

## 6. Performance and contrast

| Check                                     | Result                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                              | exit 0                                                                                                                                                                                                                                 |
| Bundle budget (`check-bundle-budget.mjs`) | **not measured locally.** On this Windows machine Next reported 0 B for every route and the script printed "No routes under /(school)/app to measure". The CI `build` job's budget step is the real measurement.                       |
| Lighthouse                                | not run locally; CI `lighthouse` job                                                                                                                                                                                                   |
| `node scripts/check-glass-contrast.mjs`   | **16/16 PASS**. Light: foreground ≥ 11.52:1, muted on bare mesh 5.19, on panel 6.63, on chrome 6.90, on overlay 8.08. Dark: foreground ≥ 8.83:1, muted on bare mesh **4.69** (lowest), on panel 6.20, on chrome 6.74, on overlay 8.29. |
| Blur scope                                | Chrome (3 fixed layers), the dashboard's ≤ 6 cards, and transient overlays. No list rows.                                                                                                                                              |

---

## 7. Security checks

No auth, data, money or file code changed. The back control only navigates to in-app paths it builds from the current pathname, or to `router.back()`. It never reads a URL parameter as a destination, so it is not an open redirect. gitleaks, Semgrep and `pnpm audit` were not run locally; the CI `security` job runs them.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                | Severity | Ship anyway?                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| 1   | In-page back links now duplicate the shell chevron on exam detail, exam results, marks entry, the staff person page and the student profile, and on roll call (owned by #82). e2e journeys click "Back to the exam". | low      | yes. Clean up in a later pass and update the journeys at the same time. |
| 2   | Tab state is not in the URL for the class hub (owned by #82); browser back does not step through its tabs.                                                                                                           | medium   | yes. #82's lane or a follow-up moves it to `?tab=`.                     |
| 3   | `ShellBack` is mounted inside `WorkspaceSwitcher`, not composed explicitly in the layouts, because the school layout belongs to #82.                                                                                 | low      | yes. Move it into `TopBar.leading` after #82 merges.                    |
| 4   | `check-glass-contrast.mjs` is not in CI (`ci.yml` belongs to #90).                                                                                                                                                   | low      | yes. Add one step after #90 merges.                                     |
| 5   | `/app/settings` has no "Theme & language" row yet (the file belongs to #110). The page is reachable from the avatar menu.                                                                                            | low      | yes                                                                     |
| 6   | New copy (appearance page, back labels, the "Home" fallback) is inline bilingual, not in `messages/*.json` (owned by #82/#110).                                                                                      | low      | yes. Fold it in after those merge.                                      |
| 7   | `SubPageHeader.backLabel` is accepted and ignored until #110 merges.                                                                                                                                                 | low      | yes                                                                     |
| 8   | Theme is stored per device (`next-themes` localStorage), not synced across devices.                                                                                                                                  | low      | yes. Follow up if the owner asks.                                       |
| 9   | Screens were verified on a fixture route, not with a signed-in live session (no dev credentials in this environment); the bundle budget was not measurable locally.                                                  | medium   | only once CI `e2e`/`lighthouse`/`build` are green                       |
| 10  | `home/language-switch-button.tsx` is unused (a first-pass leftover; `home/page.tsx` belongs to #82).                                                                                                                 | low      | yes                                                                     |

Deliberately not tested: Safari and Firefox rendering. Chromium only; the `-webkit-` prefix and the `@supports` fallback were reviewed in code, not run.

---

## 9. Sign-off

| Definition of Done                        | Met                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Spec written and matches the build        | ☑ DESIGN-SYSTEM §1.8/§3.1, D-408 items 1–10                                              |
| Migration + pgTAP                         | n/a                                                                                      |
| Unit tests                                | ☑ 605/605 (ui 116, web 489; web run twice in a row, both green); ☐ coverage not measured |
| UI at 360×800 and 1280×800 (and 820×1180) | ☑ exact-viewport screenshots, both themes                                                |
| Playwright journey at both viewports      | ☐ CI `e2e` pending                                                                       |
| a11y: zero serious/critical               | ☑ axe, 10 runs, 0 violations                                                             |
| This test report, with real numbers       | ☑                                                                                        |
| Docs updated in the same PR               | ☑ DESIGN-SYSTEM, DECISION-LOG D-408, changeset                                           |

**Signed off by:** Claude (design lane) · 2026-09-29

> Every number above comes from a command I ran and read this session. Anything not run is marked "not run", with the reason.
