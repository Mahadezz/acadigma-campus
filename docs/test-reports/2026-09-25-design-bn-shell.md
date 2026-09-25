# Test Report — F-ID-02 Profiles and preferences, Part 4 (demo cut)

|         |                                                                                |
| ------- | ------------------------------------------------------------------------------ |
| Feature | F-ID-02 — Profiles and preferences                                             |
| Part    | 4 (demo cut) — বাংলা covers the signed-in app shell                            |
| Spec    | `docs/features/01-identity/F-ID-02-profiles-and-preferences.md` §8 Part 4, §11 |
| PR      | #TBD                                                                           |
| Status  | **PASS WITH KNOWN ISSUES**                                                     |
| Date    | 2026-09-25                                                                     |
| Run by  | Claude (design lane, second builder)                                           |

---

## 1. Scope

**What this Part is.** Before this Part, picking বাংলা on the sign-in screen only translated the auth screens (`apps/web/lib/i18n.ts`'s docblock said so explicitly) — the moment a user signed in, the whole school shell (sidebar, bottom nav, top bar, dashboard, settings) reverted to English regardless of the cookie. This is the demo-cut slice of F-ID-02 Part 4: the existing `acadigma_locale` cookie mechanism now reaches the whole signed-in app. It is **not** the full Part 4 — no `user_preferences` table, no theme/palette/density, no Settings → Language screen, no migration. See D-401 and F-ID-02 §11 for the full scope decision.

**Acceptance criteria covered** (spec §9, the ones this slice touches):

| #    | Criterion                                                                                          | Covered by                                                                       |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| AC-6 | A user with `language = 'bn'` opening `/login` after sign-out sees বাংলা (cookie outlives session) | Pre-existing (F-ID-01); unchanged                                                |
| AC-7 | A বাংলা UI at 360×800 has no clipped text and no horizontal scroll                                 | `bn-shell-shots.mjs` manual run (§5); `bn-locale-shell.spec.ts` (CI, skip-gated) |
| AC-8 | A missing `bn` key falls back to English and is catchable in CI                                    | `lib/i18n-parity.test.ts` (new; see §3)                                          |

OQ-2 (Bengali numerals) is resolved by this Part: **Western digits, confirmed** — see §3/§6.

**Out of scope for this Part** — and where it is handled instead:

- `user_preferences` table, theme/palette/density, cross-device sync — full F-ID-02 Part 4.
- `/app/dashboard`'s real content (setup checklist, attendance/exam summaries) — D-400, PR #41, in review concurrently. This Part only translates the placeholder debug card currently on `main`.
- The platform staff console (`(platform)/platform`) — internal, English-only tool, never localised.
- The audit viewer's own date formatting (`audit-detail-sheet.tsx`, hardcoded `en-GB`) — operations lane's screen, unchanged.
- `packages/domain/plans.ts`'s `planReadOnlyApiError(...).message` (the read-only banner's body text) is still English-only; only the banner's title is translated. Localising the message needs threading locale into `packages/contracts`, a billing-lane change, not in scope here.

**Risk areas** — where testing effort went:

- The school shell's nav silently ignoring the locale cookie (a pre-existing gap, not something this Part's nav config introduced) — proven by the sidebar/bottom-nav screenshots in §5.
- Digit rendering: the original brief for this task said "Bengali digits"; DESIGN-SYSTEM §1.6 says Western. Confirmed Western digits render correctly with `toIntlLocale()` and added a repo-wide guard test against the bare `bn-BD` locale tag regressing this.
- The Client-Component error boundary (`error.tsx`), which cannot call the server-only `getMessages()`.

---

## 2. Environment

|                |                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Commit         | `<filled after push — see PR>`                                                                          |
| Branch         | `feat/design-bengali-app-shell`                                                                         |
| CI run         | \<link once pushed>                                                                                     |
| Preview URL    | none (D-70: previews build only on `main`)                                                              |
| Supabase       | live project (`.env.local` copied from an existing worktree for local verification only; not committed) |
| Migration head | none — no migration in this Part                                                                        |
| Seed           | `supabase/seed` (used by the committed, CI-only, `bn-locale-shell.spec.ts`)                             |
| Node / pnpm    | v24.19.0 / 10.34.5                                                                                      |
| Browsers       | Chromium (Playwright, bundled with `@playwright/test`)                                                  |
| Feature flags  | none                                                                                                    |

---

## 3. Unit and integration (Vitest)

Full local gate, run from the repo root (`pnpm test`):

| Suite                    | Tests           | Passed  | Failed | Skipped | Duration |
| ------------------------ | --------------- | ------- | ------ | ------- | -------- |
| `packages/domain`        | (part of below) |         |        |         |          |
| `packages/contracts`     | (part of below) |         |        |         |          |
| `packages/db`            | (part of below) |         |        |         |          |
| `packages/ui`            | (part of below) |         |        |         |          |
| `apps/web`               | (part of below) |         |        |         |          |
| **Total (all projects)** | **967**         | **967** | **0**  | **0**   | 20.18s   |

**Delta vs `main`:** +4 test files / +14 tests (this Part's new suites — see below). `main`'s own count was not re-measured on this branch in isolation; the total above is this branch's full run.

### New tests this Part adds

- `apps/web/lib/i18n.test.ts` — `getLocale`/`getMessages` cookie resolution: reads `acadigma_locale`, falls back to `en` on missing or unrecognised values, pairs the resolved locale with the right catalogue.
- `apps/web/lib/locale.test.ts` — `isLocale`, `toIntlLocale` (Western-digit assertion via a real `Intl.NumberFormat` call), `setLocaleCookie`/`getClientLocale` round-trip and tamper fallback.
- `apps/web/lib/i18n-parity.test.ts` — flattens `en.json`/`bn.json` to dotted key paths and asserts the sets are identical in both directions. This is the "missing-key lint" `docs/engineering/I18N.md` §3 describes as a future CI script, added here as a unit test per the brief ("extend an existing `scripts/check-*.mjs` or add a unit test").
- `apps/web/lib/bn-locale-guard.test.ts` — scans `apps/web` and `packages` source for the literal `"bn-BD"` string (which renders Bengali digits by default) outside `MoneyText`/`BnEnText`, the two components allowed to choose the digit script on purpose.

### Notable cases proven

- `getLocale()` never throws or defaults to anything but `en` on a tampered/unknown cookie value.
- `toIntlLocale("bn")` produces `"bn-BD-u-nu-latn"`, and formatting `1234` through it produces `"1,234"` (Western digits), not `"১,২৩৪"`.
- The en/bn catalogues have **zero** key drift in either direction as of this PR.
- No file in `apps/web`/`packages` (outside the two allow-listed components) formats with the bare `bn-BD` locale tag.

---

## 4. Database (pgTAP)

No migration in this Part — no new or changed tables, no new pgTAP files. `scripts/check-migrations-order.mjs` reports "No new migrations in this PR."

---

## 5. End to end (Playwright)

### Committed CI journey (skip-gated, same convention as every other seeded-account spec in this repo)

| Journey                                                                                                          | 360 × 800                                   | 1280 × 800 | Notes                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `bn-locale-shell.spec.ts` — switch to বাংলা from the user menu, verify shell + dashboard + settings, switch back | not run locally (`E2E_LIVE_SUPABASE` unset) | same       | Runs in CI once the live Supabase project is migrated + seeded (OQ-27, the same gate every other seeded journey in this repo is under). |

### Manual verification against a local production build (this Part's "Proof")

Per the brief: signed in **once per script run** as the demo owner (`campus.acadigma.com`'s demo account, credentials from `demo.txt`, never printed), against a **local** `next start` build of this branch (not the live/production site — D-70 previews only build `main`), on port 3114 per the coordinator's port assignment. View-only: no field was edited, no save button was clicked.

| Screen           | Locale | 360 × 800 | 1280 × 800 | `<html lang>` | Horizontal overflow (px) |
| ---------------- | ------ | --------- | ---------- | ------------- | ------------------------ |
| `/app/dashboard` | bn     | PASS      | PASS       | `bn`          | 0                        |
| `/app/settings`  | bn     | PASS      | PASS       | `bn`          | 0                        |

### Accessibility (axe, WCAG 2.1 A/AA — `@axe-core/playwright`, same tag set as `e2e/axe.ts`)

| Screen           | Locale    | Critical | Serious | Moderate | Minor |
| ---------------- | --------- | -------- | ------- | -------- | ----- |
| `/app/dashboard` | bn        | 0        | 0       | 0        | 0     |
| `/app/dashboard` | bn (1280) | 0        | 0       | 0        | 0     |
| `/app/settings`  | bn        | 0        | 0       | 0        | 0     |
| `/app/settings`  | bn (1280) | 0        | 0       | 0        | 0     |

**Manual checks:**

| Check                                        | 360 × 800                                                                                                                                                        | 1280 × 800 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| No horizontal scroll                         | yes                                                                                                                                                              | n/a        |
| `<html lang>` matches the active locale      | yes (`bn`)                                                                                                                                                       | yes (`bn`) |
| Sidebar/bottom-nav labels render বাংলা       | yes                                                                                                                                                              | yes        |
| Numbers/dates render Western digits in বাংলা | yes (`২৫ সেপ` reads visually similar in Hind Siliguri but the DOM text is confirmed `25`/`2026`, not `২৫`/`২০২৬` — verified programmatically, not just visually) | yes        |

### Screenshots

`docs/test-reports/assets/bn-shell/`:

| Screen         | 360 × 800                                           | 1280 × 800                           |
| -------------- | --------------------------------------------------- | ------------------------------------ |
| Dashboard (bn) | `bn-shell-dashboard-bn-360x800.png` (+ `-full.png`) | `bn-shell-dashboard-bn-1280x800.png` |
| Settings (bn)  | `bn-shell-settings-bn-360x800.png` (+ `-full.png`)  | `bn-shell-settings-bn-1280x800.png`  |

<!-- Real demo-owner account; the school shown ("Acadigma Demo School") and its data are the demo tenant's own content, not synthetic seed data, and are not sensitive. -->

**Known, pre-existing, not introduced by this Part:** both screenshots' network log shows 404s for nav links to routes with no page yet (`/app/attendance`, `/app/students`, `/app/classes`, …) — this is the same nav-completeness bug D-400 (PR #41, in review) fixes with `implemented-routes.ts`. It is independent of locale (reproduces in English too, per PR #41's own report) and is not this Part's to fix.

---

## 6. Performance

Not measured for this Part — no Lighthouse run, no bundle-size delta beyond the small `UserMenu` component (a `DropdownMenu` + `RadioGroup`, both already-loaded shadcn primitives with no new dependency). `scripts/check-bundle-budget.mjs` requires a prior `pnpm build` and was not run against a budget baseline for this PR specifically.

---

## 7. Security checks

| Check                           | Result                                      |
| ------------------------------- | ------------------------------------------- |
| gitleaks                        | not run locally (CI job)                    |
| Semgrep (ERROR severity)        | not run locally (CI job)                    |
| `pnpm audit --audit-level high` | not run for this PR specifically            |
| Supabase advisors               | not applicable — no schema change           |
| Authorized DAST                 | not applicable — no auth/money/files change |

No new attack surface: no new server action, no new table, no new grant. `UserMenu` only writes the same non-httpOnly locale cookie the existing `LanguageToggle` already writes.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Severity | Ship anyway?                                                                            | Tracked          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- | ---------------- |
| 1   | The read-only banner's body text (`planReadOnlyApiError(...).message`, `packages/contracts`) is still English-only; only its title is translated.                                                                                                                                                                                                                                                                                                                                                                               | low      | yes — fixing it needs threading locale into `packages/contracts`, a billing-lane change | F-ID-02 §11 note |
| 2   | `/app/dashboard`'s content is still the developer debug placeholder (now translated, not rebuilt) — D-400/PR #41 replaces it. Whichever of that PR and this one merges second must reconcile the `dashboard` message keys and the nav-locale prop.                                                                                                                                                                                                                                                                              | low      | yes — expected, called out in D-401                                                     | PR #41           |
| 3   | The committed `bn-locale-shell.spec.ts` did not run locally (no seeded live Supabase project available in this environment) — same gate every other seeded-account journey in this repo is under (OQ-27).                                                                                                                                                                                                                                                                                                                       | low      | yes — established repo convention, not new to this Part                                 | OQ-27            |
| 4   | Bengali copy added in this Part was written by the builder, not reviewed by a native/professional Bengali speaker. Strings to double-check: `workspace.userMenu.languageLabel` ("ভাষা"), `workspace.readOnly.title` ("এই ওয়ার্কস্পেসটি শুধু পড়ার জন্য"), `errors.appError.*`, `errors.notFoundPage.*`, `errors.forbiddenPage.*`, `dashboard.*`. All follow the existing glossary/tone already in `bn.json` (formal, no informal contractions), but the owner should spot-check them against `docs/product/GLOSSARY-EN-BN.md`. | low      | yes — flagged for owner review, not blocking                                            | this report      |

**Deliberately not tested, and why:**

- The `(account)/account/security` and `(platform)/platform` screens — out of scope (§1).
- Cross-device sync — no `user_preferences` table exists yet in this Part.

---

## 9. Sign-off

| Definition of Done                           | Met                                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| Spec written and matches the build           | ☑ (F-ID-02 §11 updated, D-401)                               |
| Migration + pgTAP isolation and escalation   | n/a — no migration                                           |
| Unit tests + coverage thresholds             | ☑ (967/967 passing; coverage thresholds hold repo-wide)      |
| UI built and verified at both viewports      | ☑                                                            |
| Playwright journey at both viewports         | ☑ committed, CI-gated (OQ-27); manual axe run passed locally |
| a11y — zero serious/critical + manual checks | ☑                                                            |
| This test report, with real numbers          | ☑                                                            |
| Docs updated in the same PR                  | ☑ (DECISION-LOG D-401, F-ID-02 §11, `docs/README.md`)        |

**Signed off by:** Claude (design lane, second builder)
**Date:** 2026-09-25
**Commit:** `<filled after push>`

> I ran these tests and read their output myself: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, every `node scripts/check-*.mjs`, `pnpm --filter @acadigma/web build`, and the manual demo-account screenshot + axe run in §5.
> Caveat: the Bengali strings this Part adds are builder-written, not professionally reviewed — see Known issue #4.
