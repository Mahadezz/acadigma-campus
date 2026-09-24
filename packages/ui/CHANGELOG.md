# @acadigma/ui

## 0.2.0

### Minor Changes

- 48488b0: F-ID-05 Onboarding, Part 3: the create-school wizard's steps 1-2 (identity, where-and-when).

  - Migration `20260925000700_school_eiin_availability.sql` (D-66): a partial unique index on `school_profiles.eiin`, plus `public.check_eiin_available(text)` — a `SECURITY DEFINER` boolean-only probe the wizard calls before a school (or any membership) exists for the caller; `supabase/tests/22_school_eiin_availability.sql`.
  - `packages/contracts/src/identity/school.ts`: the real `CreateSchoolDraft` schema (board/medium enums, EIIN format, IANA timezone, working days, academic-year shape) and the step 1/step 2 submission schemas. `onboardingDraftSchema` (`identity/onboarding.ts`) now validates against this shape, `.partial()` and `.passthrough()`, in place of Part 2's placeholder JSON bag.
  - `packages/domain/src/academic/year.ts`: `validateAcademicYearRange` (1-730 days, `ends_on > starts_on`) and `deriveFirstDayOfWeek` (Sat-first order).
  - `packages/db/src/repositories/school.ts`: `checkEiinAvailability`. `onboarding.ts`'s `saveOnboardingDraft` now always clears `onboarding_progress.completed_at` (D-60 follow-up: a fresh draft after a prior completion is resumable again).
  - `packages/ui/src/primitives/onboarding-shell.tsx` gains an `onBack` handler for in-page step navigation, plus a forwarded ref to its `<h1>` so a step transition can move focus to it.

  **PR #34 review follow-ups** (D-67):

  - Migration `20260925000800_throttle_eiin_check_bucket.sql`: `public.throttle_record_failure` gains an `eiinCheck` bucket (30 attempts / 15 min / 15 min block, per user id) — `checkEiinAvailability` was previously unthrottled, letting a signed-in account enumerate which EIINs are already on the platform.
  - `packages/ui/src/components/ui/toggle.tsx` / `toggle-group.tsx` (new, shadcn `new-york-v4`): the wizard's medium picker and working-days picker now use `ToggleGroup` (`type="single"` / `type="multiple"`) instead of the hand-rolled `segmented-control.tsx` / `day-picker-row.tsx` (removed) — Radix's roving tabindex also fixes a REACT HIGH finding (`SegmentedControl` gave every option `tabIndex=0` before a value was chosen). The timezone field is now a shadcn combobox (`Command` inside `Popover`, real search) with `Asia/Dhaka` pinned first, replacing the plain ~400-entry `Select` (OPUS 3: unusable on touch). `primitives/date-field.tsx` (removed) is a plain `Input type="date"` inside `FormControl`.
  - `wizard.tsx`: focuses each step's `<h1>` on mount (REACT HIGH: no focus management on step change); `backLabel` is now threaded through from `common.actions.back` (OPUS 1: Bengali saw the hardcoded English default); the `eiinChecking` message is wired to a live async state instead of sitting unused; the "Use {timezone}" button, EIIN helper `<summary>` and the "contact support" link all gained `min-h-11` (OPUS 2, 44px touch targets); the academic-year date range's manual cross-field error is now a real RHF error (`form.setError`/`clearErrors`) so it both has a valid described-by id and clears itself the moment either date is edited (OPUS 6).

- 98e5a8e: F-ID-05 Onboarding, Part 2: the `/onboarding` shell, chooser and state.

  - Migration `20260925000300_onboarding_progress.sql`: `onboarding_progress` (one row per user, resumable wizard state), class-U1 RLS with no DELETE at all and an added platform-staff SELECT branch for support; `supabase/tests/17_onboarding_progress.sql` (cross-user isolation, no-delete grant, platform-staff read, the `updated_at` trigger).
  - `packages/contracts/src/identity/onboarding.ts`: `getOnboardingState`/`saveOnboardingDraft`/`completeOnboarding` schemas; the wizard draft stays a size-capped JSON bag until Parts 3-4 introduce the real `CreateSchoolDraft` shape.
  - `packages/domain/src/onboarding/`: three pure, unit-tested functions — `resolveOnboardingAccess` (the redirect matrix), `resolveOnboardingChooserView` (fresh vs. resume), `resolveOnboardingExitRoute` (F-ID-05 §4.5's landing table).
  - `packages/db/src/repositories/onboarding.ts`: `getOnboardingProgress`, `saveOnboardingDraft`, `markOnboardingComplete` — all keyed on the caller's own `userId`, never a `WorkspaceContext` (onboarding runs before any membership exists).
  - `packages/ui/src/primitives/onboarding-shell.tsx` and `choice-card.tsx`: the frame and the 120px option cards every onboarding screen (this Part's chooser, and Parts 3-4's wizard) render inside.
  - `apps/web/app/(onboarding)/`: the chooser at `/onboarding` — two `ChoiceCard`s, the tutoring exit link (`completeOnboarding({exit:"personal"})` → `/personal`), and the forced-access gate for signed-out/unverified visitors.

### Patch Changes

- Updated dependencies [48488b0]
- Updated dependencies [98e5a8e]
- Updated dependencies [9746c33]
  - @acadigma/domain@0.2.0

## 0.1.0

### Minor Changes

- ecb6888: Production foundation: pnpm/Turbo monorepo, Supabase migrations 0001–0004 with RLS helpers and pgTAP suites, shared contracts/domain/db/ui packages, Next.js 15 app shell with Supabase SSR auth and PWA, 13-job CI.
- 411cefe: F-ID-01 Authentication, Parts 1-4: register + email verification, sign in/out, forgot/reset/change password. Adds `auth_throttle` and the `public.throttle_*`/`log_auth_event` RPCs (migration `20260917020000_identity_auth.sql`); `packages/domain/src/auth` (password policy, safe-return-to); `packages/contracts/src/identity/auth`; `AuthCard`/`PasswordField`/`CountdownButton`/`InlineAlert` in `packages/ui`; the `/login`, `/register`, `/verify`, `/forgot`, `/reset` and `/account/security` screens.
- df07612: `packages/ui` primitives brought into conformance with DESIGN-SYSTEM.md §3–§7: nav-config-driven `BottomNav` (role/plan/owner-visibility filtering, a "More" sheet), token-only `StatusChip`/`MoneyText` (Indian grouping, Bengali numerals, lakh/crore compact), `DataList` rows-not-cards with cursor pagination and fixed-row virtualisation, a dirty-close guard on `FormSheet`, safe-area padding on `TopBar`/`BottomNav`, and the four missing custom primitives (`AttendanceToggle`, `MarkCell`, `PeriodGrid`, `BnEnText`). OpenTelemetry via `@vercel/otel` in `apps/web/instrumentation.ts` plus a `workspace_id`/`correlation_id` span-attribute helper (D-30). `redactForAI()` in `packages/domain/src/ai/redact.ts` — the allow-listed, fail-closed projection required before any Anthropic call (D-34) — with a Semgrep rule and an eslint import restriction enforcing D-26(5).
- 53a8393: M0 wrap-up (DECISION-LOG D-56): the two nav systems (`packages/domain/src/nav` and `packages/ui/src/primitives/nav-config.ts`) are unified on domain's curated DESIGN-SYSTEM §3.2 trees as the single source of `NavItem`/`NavConfig` types and data; `packages/ui` adds only the icon map and the seller/platform trees domain deliberately does not model. New `packages/domain/src/nav/entitlements.ts` maps the nav's per-screen module keys onto the plans engine's per-bundle `plan_modules`. The school shell (`apps/web/app/(school)/app`) now picks its curated tree from `WorkspaceContext.role` server-side, computes entitled modules from the plans engine, and renders `BottomNavFromConfig` on phone and the new `SidebarFromConfig` on desktop — replacing the old hand-rolled `SCHOOL_NAV`/`SchoolSidebar` that read neither nav engine.
- c87dc0f: D-57: visual language from acadigma.com. Chrome tokens (background, foreground, card, popover, muted, border, input, ring, primary, secondary, accent, sidebar) are now literal ink (`#0b0b0b`) / paper (`#f4f4f2`) hex copied from acadigma-website's `globals.css`, replacing the indigo `--primary` and dark-navy `--sidebar`. `--danger`/`--destructive` is recoloured to the website's literal red (`#b42318` light, `#f97066` dark). `--accent` is retired from a rationed amber highlight to a plain neutral surface. Attendance, grade-band and chart colours are unchanged. Radius multipliers now match the website's; shadows are ink-tinted instead of hue-272; a new `--ease-out-expo` token is available for entrances. JetBrains Mono is added as `--font-mono` via `next/font`, and `html` gets `cv11`/`ss01` font features. `button`, `card`, `input` and `auth-card` move to the ink-tinted `shadow-flat` token in place of Tailwind's stock shadow utilities.

### Patch Changes

- 79c6671: Bump `vitest` (and its transitive `@vitest/mocker`) from 3.2.7 to 4.1.11 across every workspace to close GHSA-82fw-gwwq-j7x9 (path traversal / arbitrary file read via `@vitest/mocker`'s redirect mock), a dev-only dependency (Dependabot alerts #1–7, all moderate). 4.1.11 was published 2026-08-18, clearing D-49's 2-day release-age cooldown without an exclude entry.

  Vitest 4 removed the separate `vitest.workspace.ts` file; the five test projects (`domain`, `contracts`, `db`, `web`, `ui`) now live under `test.projects` in `vitest.config.ts`. `packages/ui` gained `@types/node` and `"node"` in its `tsconfig.json` `types` array, restoring the `process.env.NODE_ENV` typing in `src/motion/gsap.ts` that vitest 3's type chain had been pulling in incidentally. No runtime behaviour change; `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm --filter @acadigma/web build` are green.

- 98ff1f8: Load Inter and Hind Siliguri through `next/font` in the root layout and bind the `--font-sans` / `--font-bn` tokens to them (DESIGN-SYSTEM §1.6). Until now no font was loaded at all, so every surface rendered in the browser default.
- Updated dependencies [5024296]
- Updated dependencies [79c6671]
- Updated dependencies [ecb6888]
- Updated dependencies [411cefe]
- Updated dependencies [7e774ce]
- Updated dependencies [f1d28cb]
- Updated dependencies [df07612]
- Updated dependencies [53a8393]
- Updated dependencies [d6e1696]
  - @acadigma/domain@0.1.0
