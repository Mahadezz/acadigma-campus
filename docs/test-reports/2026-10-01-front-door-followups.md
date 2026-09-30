# Test Report — Front door follow-ups (headline, header pill, tab-row height)

|         |                                                         |
| ------- | ------------------------------------------------------- |
| Feature | Design lane: front door follow-ups from the #128 review |
| Spec    | D-410; `docs/plan/TODO.md` section 1b                   |
| Status  | **PASS WITH KNOWN ISSUES** (CI numbers in section 3)    |
| Date    | 2026-10-01                                              |

## 1. Scope

Hero headline clamp minimum 3rem to 2.25rem (two lines at 360, unchanged at 1280); header "Get the app" pill is the primary (ink) button; a 4.75rem spacer above the server-rendered install steps so the lazy device tabs do not move them. **Lighthouse LCP on `/` and `/login`:** the Sentry browser SDK is imported dynamically (only when a DSN is set) and the toast region loads after hydration. No migration, no new dependency.

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

## 3. Lighthouse LCP (why `/login` failed on other PRs)

Cause: Lighthouse's simulated LCP (pessimistic graph) counts every script requested before the observed first paint. `instrumentation-client.ts` imported `@sentry/nextjs` statically, so about 128 kB (gzip) of Sentry went in front of every page even with no DSN, on top of ~130 kB of React and Next. #128 added little of its own (the cell texture is not the cause: removing it left `/login` at 3764 ms); it pushed a page that already swung 2.7 to 3.7 s over the 3.5 s bound.

Local Lighthouse 12, mobile, simulated throttling, production build, 3 runs each (ms):

| Step                                 | `/login` LCP     | `/` LCP          |
| ------------------------------------ | ---------------- | ---------------- |
| before (main + this PR's UI changes) | 3966, 3971, 4023 | 3839, 3628, 3676 |
| Sentry imported dynamically          | 3045, 3045, 3056 | 2734, 2753, 2755 |
| plus Toaster loaded after hydration  | 2910, 2901, 2903 | 2607, 2605, 2642 |

FCP stays at about 1370 ms; TBT 0. Toasts are not shown before hydration (none can be triggered then). With a DSN set, Sentry initialises a few hundred ms later than before: **errors thrown before the Sentry import resolves (the first few hundred ms of a page) are not captured.**

First CI run of this change (36780798182): Lighthouse best of 3 was `/` 2761 ms and `/login` 3174 ms, but e2e-live shard 1 failed `guardian-invite` (a click on "Remove access" 230 ms after `goto` never opened the dialog). The toast region had been loaded with `next/dynamic({ ssr: false })`, which bails out to client rendering at a Suspense boundary above the page; it is now a plain effect plus `import()` (the pattern the Get-the-app chooser already uses).

## 3b. CI

See the PR; Lighthouse numbers from CI are copied there once the runs finish.

## 4. Known issues

- Shift and headline numbers come from the dev server, not a production build.
- No new Playwright assertion; the existing front-door journeys cover the page. The 360 line count is not asserted.
- Local Lighthouse is a different machine from CI; the CI numbers decide.
