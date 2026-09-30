# Test Report — Front door follow-ups (headline, header pill, tab-row height)

|         |                                                         |
| ------- | ------------------------------------------------------- |
| Feature | Design lane: front door follow-ups from the #128 review |
| Spec    | D-410; `docs/plan/TODO.md` section 1b                   |
| Status  | **PASS WITH KNOWN ISSUES** (CI numbers in section 3)    |
| Date    | 2026-10-01                                              |

## 1. Scope

Hero headline clamp minimum 3rem to 2.25rem (two lines at 360, unchanged at 1280); header "Get the app" pill is the primary (ink) button; a 4.75rem spacer above the server-rendered install steps so the lazy device tabs do not move them. No migration, no new dependency.

## 2. Local runs (Windows, Node 24)

| Check                                                                   | Result                                       |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm verify`                                                           | exit 0; 2034 passed, 36 skipped, 205 files   |
| `pnpm --filter @acadigma/web build`                                     | ok                                           |
| `scripts/check-*.mjs` (14)                                              | all ok                                       |
| Headline height at 360 (dev server, Chromium)                           | before 176.6 px (4 lines), after 66.2 px (2) |
| Headline height at 1280                                                 | 296.7 px before and after (3 lines)          |
| Install steps top before vs after the lazy tabs mount (360, dev server) | 974.5 px and 974.5 px (no shift)             |

Screenshots: `docs/test-reports/assets/2026-10-01-front-door-followups/fd-{before,after}-{360,1280}.png`.

## 3. CI

See the PR; Lighthouse numbers are copied there once the run finishes.

## 4. Known issues

- Shift and headline numbers come from the dev server, not a production build.
- No new Playwright assertion; the existing front-door journeys cover the page. The 360 line count is not asserted.
- Lighthouse LCP on `/` was about 3.5 s on the last run (budget 3.5 s error, 2.5 s warn); this change does not target it.
