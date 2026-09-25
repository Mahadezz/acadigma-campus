# Test Report — F-ID-02 Profiles and preferences, Part 4 (demo cut)

|         |                                                                                |
| ------- | ------------------------------------------------------------------------------ |
| Feature | F-ID-02 — Profiles and preferences                                             |
| Part    | 4 (demo cut) — বাংলা covers the signed-in app shell                            |
| Spec    | `docs/features/01-identity/F-ID-02-profiles-and-preferences.md` §8 Part 4, §11 |
| PR      | #51                                                                            |
| Status  | **PASS WITH KNOWN ISSUES**                                                     |
| Date    | 2026-09-25                                                                     |
| Run by  | Claude (design lane, second builder)                                           |

---

## 1. Scope

**What this Part is.** Before this Part, picking বাংলা on the sign-in screen only translated the auth screens (`apps/web/lib/i18n.ts`'s docblock said so explicitly) — the moment a user signed in, the whole school shell (sidebar, bottom nav, top bar, dashboard, settings) reverted to English regardless of the cookie. Separately, the audit viewer read language from `profiles.locale` directly and never looked at the cookie at all — two disconnected mechanisms in the same signed-in app. This Part is the demo-cut slice of F-ID-02 Part 4: the `acadigma_locale` cookie now reaches the whole signed-in app, `getLocale()` is the one resolver (cookie, then `profiles.locale`, then `en`) both paths go through, and the `UserMenu`'s switch persists to `profiles.locale` too, so it follows a signed-in user across devices. It is **not** the full Part 4 — no `user_preferences` table, no theme/palette/density, no Settings → Language screen, no new migration (`profiles.locale` already existed on `main`). See D-401 and F-ID-02 §11 for the full scope decision.

**Acceptance criteria covered** (spec §9, the ones this slice touches):

| #    | Criterion                                                                                          | Covered by                                                                       |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| AC-6 | A user with `language = 'bn'` opening `/login` after sign-out sees বাংলা (cookie outlives session) | Pre-existing (F-ID-01); unchanged                                                |
| AC-7 | A বাংলা UI at 360×800 has no clipped text and no horizontal scroll                                 | `bn-shell-shots.mjs` manual run (§5); `bn-locale-shell.spec.ts` (CI, skip-gated) |
| AC-8 | A missing `bn` key falls back to English and is catchable in CI                                    | `lib/i18n-parity.test.ts` (new; see §3)                                          |

OQ-2 (Bengali numerals) is resolved by this Part: **Western digits, confirmed** — see §3/§6.

**Out of scope for this Part** — and where it is handled instead:

- `user_preferences` table, theme/palette/density — full F-ID-02 Part 4. Cross-device _language_ sync is in scope for this Part (via the pre-existing `profiles.locale` column, not `user_preferences`); theme/palette/density sync is not.
- `/app/dashboard`'s real content — D-400 (PR #41) merged into `main` while this PR was open and was pulled in by rebasing onto `main`; its dashboard is already bilingual on its own (§5 screenshots are the merged, real dashboard, not this Part's original placeholder translation, which #41 superseded).
- The platform staff console (`(platform)/platform`) — internal, English-only tool, never localised.
- The audit viewer's own date formatting (`audit-detail-sheet.tsx`, hardcoded `en-GB`) — operations lane's screen, unchanged.
- `packages/domain/plans.ts`'s `planReadOnlyApiError(...).message` (the read-only banner's body text) is still English-only; only the banner's title is translated. Localising the message needs threading locale into `packages/contracts`, a billing-lane change, not in scope here.

**Risk areas** — where testing effort went:

- The school shell's nav silently ignoring the locale cookie (a pre-existing gap, not something this Part's nav config introduced) — proven by the sidebar/bottom-nav screenshots in §5.
- Digit rendering: the original brief for this task said "Bengali digits"; DESIGN-SYSTEM §1.6 says Western. Confirmed Western digits render correctly with `toIntlLocale()` and added a repo-wide guard test against the bare `bn-BD` locale tag regressing this — the guard caught a second, independent instance of the same bug in `(school)/app/settings/calendar/holidays-manager.tsx` (F-AC-11 Part 1, merged from `main` after this PR branched), fixed in the same commit as the rebase.
- The Client-Component error boundary (`error.tsx`), which cannot call the server-only `getMessages()`.

---

## 2. Environment

|                |                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit         | `<filled after push — see PR>`                                                                                                                                                                                                                                                                    |
| Branch         | `feat/design-bengali-app-shell`                                                                                                                                                                                                                                                                   |
| CI run         | \<link once pushed>                                                                                                                                                                                                                                                                               |
| Preview URL    | none (D-70: previews build only on `main`)                                                                                                                                                                                                                                                        |
| Supabase       | live project (`.env.local` copied from an existing worktree for local verification only; not committed)                                                                                                                                                                                           |
| Migration head | none — no migration in this Part (`main`'s own migrations from other lanes came in via the merge below)                                                                                                                                                                                           |
| `main` merge   | Merged `origin/main` once, after PR #41 (D-400 dashboard) and PR #49 (D-402 audit sentences) landed — resolved `dashboard/page.tsx` (took #41's), `(school)/app/layout.tsx` (kept both, took #41's `shell.signedInAs`/`shell.roles`), `DECISION-LOG.md`/`docs/README.md` (append-only, kept both) |
| Seed           | `supabase/seed` (used by the committed, CI-only, `bn-locale-shell.spec.ts`)                                                                                                                                                                                                                       |
| Node / pnpm    | v24.19.0 / 10.34.5                                                                                                                                                                                                                                                                                |
| Browsers       | Chromium (Playwright, bundled with `@playwright/test`)                                                                                                                                                                                                                                            |
| Feature flags  | none                                                                                                                                                                                                                                                                                              |

---

## 3. Unit and integration (Vitest)

Full local gate, run from the repo root (`pnpm test`):

| Suite                    | Tests           | Passed   | Failed | Skipped | Duration |
| ------------------------ | --------------- | -------- | ------ | ------- | -------- |
| `packages/domain`        | (part of below) |          |        |         |          |
| `packages/contracts`     | (part of below) |          |        |         |          |
| `packages/db`            | (part of below) |          |        |         |          |
| `packages/ui`            | (part of below) |          |        |         |          |
| `apps/web`               | (part of below) |          |        |         |          |
| **Total (all projects)** | **1081**        | **1081** | **0**  | **0**   | ~29s     |

**Delta vs `main`:** +5 test files / +21 tests are this Part's own new suites (see below); the rest of the delta vs. the pre-merge count is PR #41 (D-400) and PR #49 (D-402), which merged into `main` while this PR was open and were pulled in by merging `main` into this branch (BUILDER-BRIEF: "another design PR (#41) is in review — if it merges while you work, merge `origin/main` and keep both").

### New tests this Part adds

- `apps/web/lib/i18n.test.ts` — `getLocale`/`getMessages` resolution precedence: cookie first, then the signed-in user's `profiles.locale`, then `en`; never throws on a tampered cookie, an unknown `profiles.locale` value, a signed-out caller, or a Supabase error.
- `apps/web/lib/locale.test.ts` — `isLocale`, `toIntlLocale` (Western-digit assertion via a real `Intl.NumberFormat` call), `setLocaleCookie`/`getClientLocale` round-trip and tamper fallback.
- `apps/web/lib/i18n-parity.test.ts` — flattens `en.json`/`bn.json` to dotted key paths and asserts the sets are identical in both directions. This is the "missing-key lint" `docs/engineering/I18N.md` §3 describes as a future CI script, added here as a unit test per the brief ("extend an existing `scripts/check-*.mjs` or add a unit test").
- `apps/web/lib/bn-locale-guard.test.ts` — scans `apps/web` and `packages` source for the literal `"bn-BD"` string (which renders Bengali digits by default) outside `MoneyText`/`BnEnText`, the two components allowed to choose the digit script on purpose.
- `apps/web/app/(shared)/workspace/actions.test.ts` — `updateLocale`: rejects an unknown locale before touching Supabase, refuses when signed out, updates the caller's own `profiles.locale` row, returns an error `Result` (not a throw) on a write failure.

### Notable cases proven

- `getLocale()` never throws or defaults to anything but `en` on a tampered/unknown cookie value, an unknown `profiles.locale` value, or a Supabase failure.
- `getLocale()` correctly skips the `profiles.locale` lookup entirely when a valid cookie is present (asserted via a mock call-count check), and correctly skips it when signed out (no `.from("profiles")` call).
- `toIntlLocale("bn")` produces `"bn-BD-u-nu-latn"`, and formatting `1234` through it produces `"1,234"` (Western digits), not `"১,২৩৪"`.
- The en/bn catalogues have **zero** key drift in either direction as of this PR.
- No file in `apps/web`/`packages` (outside the two allow-listed components) formats with the bare `bn-BD` locale tag.
- `updateLocale` writes only the caller's own row (`.eq("id", user.id)`) and returns a `Result`, never throwing, on both the validation and the Supabase-error path.

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

Re-run after rebasing onto `main` (post PR #41/#49 merge): same result, plus **zero prefetch 404s** on either screen (previously present, from the pre-#41 nav — D-400's `implemented-routes.ts` fix, not this Part's).

**Cross-device persistence (`profiles.locale`, D-401 item 9), separate click-through run:** signed in once, clicked the real `UserMenu` (not a cookie injection) to switch to বাংলা (`<html lang>` → `bn`), then cleared only the browser's `acadigma_locale` cookie (simulating a second device that never set it locally) and reloaded — the page still rendered `<html lang>` → `bn`, proving `profiles.locale` was actually written and `getLocale()`'s fallback reads it. Switched back to English via the same menu afterwards, leaving the demo account as found. Verified the real dashboard's date/activity timestamps too (not just this Part's own placeholder): `body.innerText()` showed `"শুক্রবার 25 সেপ্টেম্বর"` and `"25 সেপ, 2:16 PM"` — Bengali month/weekday names, Western digits, zero Bengali digit characters found by regex.

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

The screenshots in `docs/test-reports/assets/bn-shell/` are from the post-merge run (real D-400 dashboard, zero 404s). An earlier run against this Part's pre-merge code showed the same locale/axe/overflow results against the placeholder dashboard, plus the pre-#41 nav's known 404s — superseded, not kept, once `main` was merged in.

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

One new server action, `updateLocale` (`(shared)/workspace/actions.ts`): validates the input against the two known locales before touching Supabase, requires a signed-in `auth.getUser()`, and writes only `.eq("id", user.id)` — the same row RLS's pre-existing `profiles_update_self` policy already lets the caller update directly, so this closes no gap and opens none; it exists for the audit trail and testability a plain client-side `.update()` call would not have. No new table, no new grant.

---

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Severity | Ship anyway?                                                                                                                                                           | Tracked          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | The read-only banner's body text (`planReadOnlyApiError(...).message`, `packages/contracts`) is still English-only; only its title is translated.                                                                                                                                                                                                                                                                                                                                                                               | low      | yes — fixing it needs threading locale into `packages/contracts`, a billing-lane change                                                                                | F-ID-02 §11 note |
| 2   | Resolved by rebase: `/app/dashboard` is now the real D-400 dashboard (PR #41 merged into `main` while this PR was open); this Part's original placeholder translation was superseded by the merge, not kept.                                                                                                                                                                                                                                                                                                                    | n/a      | resolved                                                                                                                                                               | —                |
| 3   | The committed `bn-locale-shell.spec.ts` did not run locally (no seeded live Supabase project available in this environment) — same gate every other seeded-account journey in this repo is under (OQ-27).                                                                                                                                                                                                                                                                                                                       | low      | yes — established repo convention, not new to this Part                                                                                                                | OQ-27            |
| 4   | Bengali copy added in this Part was written by the builder, not reviewed by a native/professional Bengali speaker. Strings to double-check: `workspace.userMenu.languageLabel` ("ভাষা"), `workspace.readOnly.title` ("এই ওয়ার্কস্পেসটি শুধু পড়ার জন্য"), `errors.appError.*`, `errors.notFoundPage.*`, `errors.forbiddenPage.*`, `dashboard.*`. All follow the existing glossary/tone already in `bn.json` (formal, no informal contractions), but the owner should spot-check them against `docs/product/GLOSSARY-EN-BN.md`. | low      | yes — flagged for owner review, not blocking                                                                                                                           | this report      |
| 5   | `bn-locale-shell.spec.ts` persists `profiles.locale` on the shared seeded `owner@acadigma.test` account — every other seeded-account journey in this repo assumes that account renders in English. Mitigated with a `test.afterEach` that always switches back to English, but a test in a different spec file running concurrently in another CI worker during the (short) window this suite is mid-বাংলা is not fully race-proof.                                                                                             | low      | yes — same shared-seed-account tradeoff `school-settings.spec.ts` already accepts for its own mutation; a dedicated locale-test account is a follow-up, not built here | OQ-27            |

**Deliberately not tested, and why:**

- The `(account)/account/security` and `(platform)/platform` screens — out of scope (§1).
- Theme/palette/density cross-device sync — no `user_preferences` table exists yet in this Part. (Language cross-device sync _is_ tested — see the manual run above.)

---

## 9. Sign-off

| Definition of Done                           | Met                                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| Spec written and matches the build           | ☑ (F-ID-02 §11 updated, D-401)                               |
| Migration + pgTAP isolation and escalation   | n/a — no migration                                           |
| Unit tests + coverage thresholds             | ☑ (1081/1081 passing; coverage thresholds hold repo-wide)    |
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
