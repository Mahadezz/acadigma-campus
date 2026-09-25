# @acadigma/domain

## 0.3.0

### Minor Changes

- c1a5060: F-AC-06 Part 1: grade scales (D-302). Migration `20260925300302_grade_scales.sql` adds
  `grade_scales` / `grade_bands` with a no-gap/no-overlap coverage trigger,
  `app.band_for` / `app.round_half_up`, and the `seed_bd_grade_scale` / `save_grade_scale`
  RPCs. `@acadigma/domain/grading` (`bandFor`, `roundHalfUp`, `checkCoverage`,
  `BD_GRADE_BANDS`) matches SQL on one parity table. New permission
  `settings.grade_scale.write` (owner/admin). New screen `/app/settings/grade-scale`: the
  one-tap Bangladesh default and a live "72 % → A (4.00)" preview.
- 762259e: F-AC-11 School calendar, Part 1 demo cut (D-202): holidays, working-day overrides and `app.is_school_day`.

  - Migration `20260925300301_school_calendar.sql`: `holidays`, `working_day_overrides` (RLS, freeze, audit, read-only guard) and `app.is_school_day` / `app.school_days` / `app.school_day_count` (override > weekly pattern > holiday); pgTAP `41_school_calendar.sql`.
  - `packages/contracts/src/calendar.ts`: `createHolidayInputSchema`, `deleteHolidayInputSchema`, `Holiday`.
  - `packages/db/src/repositories/calendar.ts`: `listHolidays`, `createHoliday`, `deleteHoliday`.
  - `packages/domain`: `calendar.holiday.write` (owner/admin); `holidays` and `working_day_overrides` in the generic audit catalogue.
  - `/app/settings/calendar`: the holiday list; owners and admins can add and remove holidays.

- a8fa0cd: The school dashboard is real (D-400): owners and admins see their school, plan and trial days left, members by role, the staff-directory count, a setup checklist and recent audit activity. Attendance and exam results are empty slots until those features ship. Teachers get a lighter view. Everything is available in English and Bengali.
- 0f2fce6: F-ID-05 Onboarding, Part 4: the create-school wizard's classes and review steps, and the transaction that creates the school (D-100).

  - Migration `20260925300101_create_school_workspace.sql`: `grade_levels` and `academic_years` (T2 RLS), and `public.create_school_workspace(jsonb)` — one SECURITY DEFINER transaction that creates the school (owner, join code, Pro trial via the existing triggers), its profile, current academic year and grade levels, completes onboarding, and records an idempotency key; the only way to create a school (the client INSERT on `workspaces` is removed); input validated before the EIIN is tried and every attempt counted in a `createSchool` throttle bucket; named errors `EIIN_TAKEN`, `RATE_LIMITED` (3 per day, 30 attempts per 15 min), `INVALID_TIMEZONE`, `INVALID_ACADEMIC_YEAR`, `VALIDATION`, `WORKSPACE_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REUSED`. `supabase/tests/30_create_school_workspace.sql`.
  - `packages/domain/src/academic/gradeLevels.ts`: presets (Play–KG, Class 1–12, O/A-Level), ordering, Bangla names, range shortcuts, custom levels.
  - `packages/contracts`: `gradeLevelsSchema`, `createSchoolWorkspaceInputSchema`/`Output`; the draft carries `grade_levels` and `idempotency_key`.
  - `packages/db`: `createSchoolWorkspace` repository with the error mapping.
  - `apps/web`: `createSchoolWorkspace` action (sets the active-workspace cookie, lands on `/app`); wizard step 3 (classes) and step 4 (review and create), en + bn; 44 px inputs on steps 1-2.
  - `packages/ui`: `OnboardingShell` takes a localised `progressLabel`.
  - Settings: the EIIN is read-only in the school profile form (set at creation; support changes it), matching the database guard.

- 235470f: F-OP-07 School settings, Part 1 remainder (D-200): `/app/settings` (grouped rows with search), the read-only "How this school works" page for every member, the school profile form and branding with a live report-card header preview.

  - `packages/contracts/src/settings.ts`: `schoolProfileFieldsSchema`, `schoolTypeSchema`, `updateSchoolProfileInputSchema`, `updateBrandingInputSchema` (version = `updated_at`). `./identity/school` is now an export subpath.
  - `packages/domain/src/settings/header.ts`: `renderHeaderLine` / `unknownHeaderTokens` for `{token}` header lines.
  - `packages/db/src/repositories/settings.ts`: `getSchoolProfile`, `updateSchoolProfile` with optimistic concurrency (a stale version returns `conflict`, nothing is overwritten) and a duplicate-EIIN `conflict` on the `eiin` field.
  - `apps/web/app/(school)/app/settings/profile-actions.ts`: `updateSchoolProfile` / `updateBranding`: owner/admin only, `requireWritable` before any write, unknown header tokens refused.
  - `packages/ui/src/components/ui/native-select.tsx` (new, shadcn `new-york-v4`).

### Patch Changes

- Updated dependencies [c1a5060]
- Updated dependencies [762259e]
- Updated dependencies [137ac19]
- Updated dependencies [0f2fce6]
- Updated dependencies [235470f]
- Updated dependencies [4801338]
  - @acadigma/contracts@0.3.0

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

- 9746c33: F-ID-03 Workspaces, Part 4: workspace switcher and the `(school)` shell layout gate.

  - `packages/domain/src/workspace/shellGate.ts`: `resolveShellGate(shell, {workspaceType, role})`, a pure function deciding `allow`/`redirect`/`forbidden` for the `school`/`personal`/`family` shells by reusing `resolveLandingRoute`. Closes the M0 wrap-up review's known issue (PR #17): `(school)/app/layout.tsx` had no check that a resolved membership actually belongs to `/app`, so a `parent` role or a `personal` workspace would render a curated nav tree pointing at routes that did not exist.
  - `apps/web/app/(school)/app/layout.tsx`: calls the gate right after `requireWorkspace()`; redirects a `parent` to `/family`, a `personal` workspace to `/personal`.
  - `apps/web/app/(personal)/personal/` and `apps/web/app/(family)/family/`: minimal shells — the same gate, a top bar, and one placeholder page each. No nav wired yet; F-ID-06/F-AC-10 build the real screens.
  - `apps/web/app/(shared)/workspace/workspace-switcher.tsx`: the top-bar `WorkspaceSwitcher` chip + sheet, wired into all three shells, calling the existing `switchWorkspace`/`listMyWorkspaces` server actions.

### Patch Changes

- Updated dependencies [48488b0]
- Updated dependencies [98e5a8e]
- Updated dependencies [3ccaf44]
  - @acadigma/contracts@0.2.0

## 0.1.0

### Minor Changes

- 5024296: F-ID-09 Parts 1-3 (audit viewer): the audit substrate — richer `audit_events` columns (actor_kind, subject_user_id, changed_fields, severity, hashed request IP), `app.audit_action_catalog` with the F-ID-09 §5.1 action catalogue and a CI parity check against its TypeScript mirror, a universal secret deny-list plus a free-text-nulling mechanism in the generic audit trigger, `audit_events_view` as the sole read surface, and correlation-id threading via a PostgREST pre-request hook — plus the owner-facing audit viewer at `/app/audit` (filterable list, detail sheet with a redacted diff, and the correlation/per-record history views).
- ecb6888: Production foundation: pnpm/Turbo monorepo, Supabase migrations 0001–0004 with RLS helpers and pgTAP suites, shared contracts/domain/db/ui packages, Next.js 15 app shell with Supabase SSR auth and PWA, 13-job CI.
- 411cefe: F-ID-01 Authentication, Parts 1-4: register + email verification, sign in/out, forgot/reset/change password. Adds `auth_throttle` and the `public.throttle_*`/`log_auth_event` RPCs (migration `20260917020000_identity_auth.sql`); `packages/domain/src/auth` (password policy, safe-return-to); `packages/contracts/src/identity/auth`; `AuthCard`/`PasswordField`/`CountdownButton`/`InlineAlert` in `packages/ui`; the `/login`, `/register`, `/verify`, `/forgot`, `/reset` and `/account/security` screens.
- 7e774ce: F-ID-03 Workspaces & Membership, Parts 1-3: tenancy hardening + `WorkspaceContext` resolution + permission matrix + nav engine.

  - Migration `20260917020300_tenancy_hardening.sql` (D-50): `public.switch_workspace`/`public.list_my_workspaces`/`public.log_tenancy_context_rejected` RPCs, and `app.attach_freeze_workspace('public.school_profiles')` closing a real tenant-reparenting gap (the table's `workspace_id` PK was UPDATE-able).
  - `supabase/tests/09_tenancy.sql`: the four Base44 security-review attack paths (self-role escalation, cross-tenant read/write, membership self-insert-as-owner, removed-member access) re-proven with zero-rows-affected assertions.
  - `packages/db/src/workspace-context.ts`: full F-ID-03 §4.3 resolution order (header → `profiles.last_active_workspace_id` → first active membership, personal first), typed failure reasons, and the `tenancy.context_rejected` audit tripwire on a forged header.
  - `packages/domain/src/permissions.ts`: extended to the full F-ID-03 §2 tenancy/membership action list, with an exhaustive transcribed-table test.
  - `packages/domain/src/nav/`: typed nav config per workspace type × role (DESIGN-SYSTEM §3.2) and the pure `filterNav`/`isRouteVisible` functions.
  - `packages/domain/src/workspace/resolveLanding.ts`: `resolveLandingRoute` (F-ID-03 §4.4), replacing F-ID-01's `/onboarding`-only stub.
  - `apps/web/lib/workspace.ts` `requireWorkspace()` (unchanged contract, now backed by the hardened resolver) + `apps/web/app/(shared)/workspace/actions.ts` (`switchWorkspace`, `listMyWorkspaces`); `packages/contracts/src/identity/workspace.ts`.
  - `apps/web/app/(school)/app/page.tsx`: redirects the school shell root to `/app/dashboard` (needed for `resolveLandingRoute`'s `/app` destination to actually resolve).

- f1d28cb: M0 cross-feature gates: F-OP-07 school settings `resolve()` with the shipped defaults for the five `school_profiles` policy blobs, a read/patch repository and `updateSchoolSettings`/`getSchoolSettings` server action; F-ID-07 v1 notification event catalogue (54 events), its contracts mirror, and a CI parity test keeping catalogue, code and translated strings in sync.
- df07612: `packages/ui` primitives brought into conformance with DESIGN-SYSTEM.md §3–§7: nav-config-driven `BottomNav` (role/plan/owner-visibility filtering, a "More" sheet), token-only `StatusChip`/`MoneyText` (Indian grouping, Bengali numerals, lakh/crore compact), `DataList` rows-not-cards with cursor pagination and fixed-row virtualisation, a dirty-close guard on `FormSheet`, safe-area padding on `TopBar`/`BottomNav`, and the four missing custom primitives (`AttendanceToggle`, `MarkCell`, `PeriodGrid`, `BnEnText`). OpenTelemetry via `@vercel/otel` in `apps/web/instrumentation.ts` plus a `workspace_id`/`correlation_id` span-attribute helper (D-30). `redactForAI()` in `packages/domain/src/ai/redact.ts` — the allow-listed, fail-closed projection required before any Anthropic call (D-34) — with a Semgrep rule and an eslint import restriction enforcing D-26(5).
- 53a8393: M0 wrap-up (DECISION-LOG D-56): the two nav systems (`packages/domain/src/nav` and `packages/ui/src/primitives/nav-config.ts`) are unified on domain's curated DESIGN-SYSTEM §3.2 trees as the single source of `NavItem`/`NavConfig` types and data; `packages/ui` adds only the icon map and the seller/platform trees domain deliberately does not model. New `packages/domain/src/nav/entitlements.ts` maps the nav's per-screen module keys onto the plans engine's per-bundle `plan_modules`. The school shell (`apps/web/app/(school)/app`) now picks its curated tree from `WorkspaceContext.role` server-side, computes entitled modules from the plans engine, and renders `BottomNavFromConfig` on phone and the new `SidebarFromConfig` on desktop — replacing the old hand-rolled `SCHOOL_NAV`/`SchoolSidebar` that read neither nav engine.
- d6e1696: F-CM-06 Plans & Subscriptions, Parts 1-3: the reusable plans/limits engine. Adds
  `packages/domain/src/plans` (pure `assertWithinLimit`, `hasModule`, trial and
  proration math), `packages/db/src/repositories/{plans,subscriptions,usage}` (including
  the `requireWritable` PLAN_READ_ONLY guard, D-29), and `packages/contracts/src/plans`
  Zod schemas. Migration `20260917020100_plans_limits_engine.sql` adds a
  `platform_settings` table (AI top-up placeholders, D-39), seeds the `fees` module on
  Starter+ (D-31), adds `app.workspace_plan`/`app.within_limit`, and closes a permission
  gap in `app.set_access_mode` (previously callable by any authenticated user).

### Patch Changes

- 79c6671: Bump `vitest` (and its transitive `@vitest/mocker`) from 3.2.7 to 4.1.11 across every workspace to close GHSA-82fw-gwwq-j7x9 (path traversal / arbitrary file read via `@vitest/mocker`'s redirect mock), a dev-only dependency (Dependabot alerts #1–7, all moderate). 4.1.11 was published 2026-08-18, clearing D-49's 2-day release-age cooldown without an exclude entry.

  Vitest 4 removed the separate `vitest.workspace.ts` file; the five test projects (`domain`, `contracts`, `db`, `web`, `ui`) now live under `test.projects` in `vitest.config.ts`. `packages/ui` gained `@types/node` and `"node"` in its `tsconfig.json` `types` array, restoring the `process.env.NODE_ENV` typing in `src/motion/gsap.ts` that vitest 3's type chain had been pulling in incidentally. No runtime behaviour change; `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm --filter @acadigma/web build` are green.

- Updated dependencies [5024296]
- Updated dependencies [79c6671]
- Updated dependencies [ecb6888]
- Updated dependencies [411cefe]
- Updated dependencies [7e774ce]
- Updated dependencies [f1d28cb]
- Updated dependencies [d6e1696]
  - @acadigma/contracts@0.1.0
