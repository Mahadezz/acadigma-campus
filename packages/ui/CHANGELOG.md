# @acadigma/ui

## 0.4.1

### Patch Changes

- db0cd58: F-AC-01 section subjects, demo cut (D-107): owners and admins pick each section's subjects and who teaches each one from a Subjects sheet on the Classes page (English and Bangla). New `listMySections` returns the sections a member teaches, as class teacher or subject teacher, for the basic-mode home. New exams give each paper the section's subject teacher. A member who leaves stops teaching their subjects, even in a read-only school. A form sheet's Save button stays visible on a phone.
- Updated dependencies [ab3b1eb]
- Updated dependencies [d4e2480]
- Updated dependencies [5996a98]
  - @acadigma/domain@0.7.0

## 0.4.0

### Minor Changes

- 9e5421e: F-ID-10 Part 1 (D-403, D-404): basic-mode display preferences. `user_preferences.ui_mode`/`text_size` (added to the existing table, not a new one), `updateUiPreferences`/`getUiPreferences`, non-httpOnly cookie mirrors, `<html data-text-size data-ui-mode>` rendered server-side for a no-flash first paint, `/app/settings/display` (text-size radio cards + basic-mode switch, hidden for staff), "Switch to basic mode" in the full app's user menu, and a minimal `/app/home` placeholder so turning basic mode on and switching back both work end to end. The class-by-class home and class hub are F-ID-10 Parts 2-3.

### Patch Changes

- Updated dependencies [07780bc]
- Updated dependencies [9e5421e]
- Updated dependencies [4a954d2]
  - @acadigma/domain@0.6.0

## 0.3.2

### Patch Changes

- Updated dependencies [8d112a1]
- Updated dependencies [189fb24]
  - @acadigma/domain@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [d704c7e]
- Updated dependencies [d1f6cca]
- Updated dependencies [932f920]
- Updated dependencies [4091c9e]
- Updated dependencies [baa055e]
- Updated dependencies [5b4dbd6]
  - @acadigma/domain@0.4.0

## 0.3.0

### Minor Changes

- bf939f1: Visual refinement (D-68 "Blend"): 6px radius, hairline rings instead of drop shadows on cards and popovers, lighter and tighter headings, a 16px body and a mono eyebrow label, on the unchanged acadigma.com ink/paper palette. The Acadigma Campus logo (grid mark + wordmark) now heads the sign-in pages, the onboarding chooser and the school shell, and the app icon, favicon, Apple touch icon, PWA icons and link-preview image are the real Campus brand assets. New `GridMark`/`Logo` primitives carry every Acadigma product mark.
- 235470f: F-OP-07 School settings, Part 1 remainder (D-200): `/app/settings` (grouped rows with search), the read-only "How this school works" page for every member, the school profile form and branding with a live report-card header preview.

  - `packages/contracts/src/settings.ts`: `schoolProfileFieldsSchema`, `schoolTypeSchema`, `updateSchoolProfileInputSchema`, `updateBrandingInputSchema` (version = `updated_at`). `./identity/school` is now an export subpath.
  - `packages/domain/src/settings/header.ts`: `renderHeaderLine` / `unknownHeaderTokens` for `{token}` header lines.
  - `packages/db/src/repositories/settings.ts`: `getSchoolProfile`, `updateSchoolProfile` with optimistic concurrency (a stale version returns `conflict`, nothing is overwritten) and a duplicate-EIIN `conflict` on the `eiin` field.
  - `apps/web/app/(school)/app/settings/profile-actions.ts`: `updateSchoolProfile` / `updateBranding`: owner/admin only, `requireWritable` before any write, unknown header tokens refused.
  - `packages/ui/src/components/ui/native-select.tsx` (new, shadcn `new-york-v4`).

### Patch Changes

- 0f2fce6: F-ID-05 Onboarding, Part 4: the create-school wizard's classes and review steps, and the transaction that creates the school (D-100).

  - Migration `20260925300101_create_school_workspace.sql`: `grade_levels` and `academic_years` (T2 RLS), and `public.create_school_workspace(jsonb)` — one SECURITY DEFINER transaction that creates the school (owner, join code, Pro trial via the existing triggers), its profile, current academic year and grade levels, completes onboarding, and records an idempotency key; the only way to create a school (the client INSERT on `workspaces` is removed); input validated before the EIIN is tried and every attempt counted in a `createSchool` throttle bucket; named errors `EIIN_TAKEN`, `RATE_LIMITED` (3 per day, 30 attempts per 15 min), `INVALID_TIMEZONE`, `INVALID_ACADEMIC_YEAR`, `VALIDATION`, `WORKSPACE_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REUSED`. `supabase/tests/30_create_school_workspace.sql`.
  - `packages/domain/src/academic/gradeLevels.ts`: presets (Play–KG, Class 1–12, O/A-Level), ordering, Bangla names, range shortcuts, custom levels.
  - `packages/contracts`: `gradeLevelsSchema`, `createSchoolWorkspaceInputSchema`/`Output`; the draft carries `grade_levels` and `idempotency_key`.
  - `packages/db`: `createSchoolWorkspace` repository with the error mapping.
  - `apps/web`: `createSchoolWorkspace` action (sets the active-workspace cookie, lands on `/app`); wizard step 3 (classes) and step 4 (review and create), en + bn; 44 px inputs on steps 1-2.
  - `packages/ui`: `OnboardingShell` takes a localised `progressLabel`.
  - Settings: the EIIN is read-only in the school profile form (set at creation; support changes it), matching the database guard.

- Updated dependencies [c1a5060]
- Updated dependencies [762259e]
- Updated dependencies [a8fa0cd]
- Updated dependencies [0f2fce6]
- Updated dependencies [235470f]
  - @acadigma/domain@0.3.0

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
