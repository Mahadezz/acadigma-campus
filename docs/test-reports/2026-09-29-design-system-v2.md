# Test Report — Design System v2: liquid glass, theme control, shell back

|         |                                                                                      |
| ------- | ------------------------------------------------------------------------------------ |
| Feature | Design lane: Design System v2 (D-408)                                                |
| Part    | Glass on an ambient mesh, theme control, language to Settings, shell back affordance |
| Spec    | `docs/architecture/DESIGN-SYSTEM.md` §1.8, §1.9, §3.1; D-408                         |
| PR      | #109                                                                                 |
| Status  | **PASS WITH KNOWN ISSUES** (CI run 36713791798 green on `ee9ce92f`, §1a)             |
| Date    | 2026-09-29, third pass 2026-09-30                                                    |
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

## 1a. Third pass (2026-09-30, after a power cut)

- **Glass had no blur in production builds on Chrome/Android.** The CSS minifier treats `backdrop-filter` and `-webkit-backdrop-filter` as one property and keeps only the last; `tokens.css` declared the prefix last, so the built CSS shipped `-webkit-backdrop-filter` alone, which Chrome ignores (computed `backdrop-filter: none` on the BottomNav, checked in the browser). Content under the bottom nav was drawn sharp through it. Fixed by ordering the prefix first in all five places; `packages/ui/src/lib/glass-css.test.ts` fails on the old file and passes on the new one. The screenshots below are all retaken on the fixed build.
- The quick-admit sheet moved to `students/admit-sheet.tsx` and loads with `next/dynamic` on first open; `admitErrorText` moved with it. `/app/students` first-load JS is now **206 kB** gzipped.
- `ShellBack` is imported directly again (not `next/dynamic`); the budget still holds (largest school route 239 kB).
- Sonner rich-colour toasts use our `*-soft`/`*-ink` pairs: axe measured sonner's own success green at 4.25:1.
- `origin/main` merged twice (#119, #120, #90, #121, then #124 and #82); CI lint (a Prettier miss on `settings/danger/page.tsx`) fixed.
- Three live journeys still clicked the language controls D-408 removed (the avatar-menu radio, the basic-home button): `bn-locale-shell`, `basic-mode-toggle-sync` AC3 and `basic-home-tap-targets` failed in e2e-live on run 36711440085. They now share an `e2e/locale.ts` helper that picks the language on Settings → Theme & language; the tap-target journey asserts the button is gone.
- **CI run 36713791798 on `ee9ce92f`: every check green**: lint, typecheck, unit, contracts, build (with the bundle budget), security, e2e, e2e-live shards 1–4, lighthouse, changeset, docs-sync. `db`/`db-integration` were skipped (no migration). Vercel's preview deploy failed on Vercel's own rate limit ("retry in 24 hours"); it is not a required check.

---

## 2. Environment

|             |                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit      | `d3397c2a` + sonner/report commit (third pass); second pass at `c05ba2a3`                                                                                                                                |
| Branch      | `feat/design-demo-screens` (merged with `origin/main` at `f47e1515`, #105)                                                                                                                               |
| CI run      | pending at the time of writing; see the PR checks                                                                                                                                                        |
| Supabase    | not touched; no migration                                                                                                                                                                                |
| Node / pnpm | Node 24.19 / pnpm 10                                                                                                                                                                                     |
| Browser     | Installed Google Chrome via Playwright `channel: "chrome"`, headless                                                                                                                                     |
| Screens     | a temporary fixture route rendering the real `AppShell`/`TopBar`/`SchoolSidebar`/`SchoolBottomNav`/`DashboardView`/`AppearanceForm`/`ShellBack` with invented copy. The route was deleted before commit. |

---

## 3. Unit and integration (Vitest)

**After the second main merge (`ee9ce92f`), full `pnpm test`:** 195 files passed, 11 skipped; **1936 passed**, 36 skipped, 0 failed; 51.9 s. Coverage: statements 85.27 %, branches 76.03 %, functions 85.66 %, lines 88.50 %.

**Third pass, before that merge, full `pnpm test` (coverage on):** 192 files passed, 11 skipped; **1912 tests passed**, 36 skipped, 0 failed; 72.1 s. Coverage (all files): statements 85.73 %, branches 76.75 %, functions 85.93 %, lines 88.86 %. One earlier full run in this session had one failure, `settings/history-line.test.ts` hitting the 5 s timeout under load; it passed alone and in the next full run (§8).

Second pass:

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

**axe, third pass:** 16 runs on the fixed build (light/dark × dashboard and Appearance at 360, 820 and 1280, plus toast and the open More sheet at 360): **0 violations** in all 16, after the toast fix. Before it, the light success toast had 1 serious `color-contrast` (4.25:1).

**axe, second pass (WCAG 2.0/2.1 A+AA, `@axe-core/playwright` 4.13):** 10 runs on the fixture route, covering light/dark × 360×800/1280×800 × dashboard/appearance, plus the open More sheet at 360:

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
7. (Third pass) Content read sharp through the bottom nav on the production build: the minifier had dropped the unprefixed `backdrop-filter` (§1a). Fixed and every shot retaken with `next build` + `next start`.

---

## 6. Performance and contrast

| Check                                     | Result                                                                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                              | exit 0                                                                                                                                                                                                                                 |
| Bundle budget (`check-bundle-budget.mjs`) | third pass, measured locally: every `/(school)/app` route under 250 kB; largest `settings/calendar` 239 kB, `staff/team` 234 kB, `/app/students` 206 kB.                                                                               |
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
| 5   | ~~No "Theme & language" row in `/app/settings`~~ — resolved (row added; kept alongside the #119 account row in the merge).                                                                                           | —        | —                                                                       |
| 6   | New copy (appearance page, back labels, the "Home" fallback) is inline bilingual, not in `messages/*.json` (owned by #82/#110).                                                                                      | low      | yes. Fold it in after those merge.                                      |
| 7   | `SubPageHeader.backLabel` is accepted and ignored until #110 merges.                                                                                                                                                 | low      | yes                                                                     |
| 8   | Theme is stored per device (`next-themes` localStorage), not synced across devices.                                                                                                                                  | low      | yes. Follow up if the owner asks.                                       |
| 9   | Screens were verified on a fixture route, not with a signed-in live session (no dev credentials in this environment); the bundle budget was not measurable locally.                                                  | medium   | only once CI `e2e`/`lighthouse`/`build` are green                       |
| 11  | Success/info/warning/error toasts are now near-opaque soft fills (legibility over glass). Neutral toasts keep the glass tint.                                                                                        | low      | yes                                                                     |
| 12  | `settings/history-line.test.ts` timed out once (5 s) during a loaded full run; passes alone and on rerun.                                                                                                            | low      | yes; raise its timeout if it recurs in CI                               |
| 13  | Screenshots come from a scratch fixture route (deleted before this commit), rendered against dummy public Supabase env; no signed-in session.                                                                        | medium   | lead reviews the screenshots; CI `e2e` runs the live journeys           |
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
