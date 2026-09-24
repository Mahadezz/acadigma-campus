---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/ui": minor
---

F-ID-05 Onboarding, Part 3: the create-school wizard's steps 1-2 (identity, where-and-when).

- Migration `20260925000700_school_eiin_availability.sql` (D-66): a partial unique index on `school_profiles.eiin`, plus `public.check_eiin_available(text)` — a `SECURITY DEFINER` boolean-only probe the wizard calls before a school (or any membership) exists for the caller; `supabase/tests/22_school_eiin_availability.sql`.
- `packages/contracts/src/identity/school.ts`: the real `CreateSchoolDraft` schema (board/medium enums, EIIN format, IANA timezone, working days, academic-year shape) and the step 1/step 2 submission schemas. `onboardingDraftSchema` (`identity/onboarding.ts`) now validates against this shape, `.partial()` and `.passthrough()`, in place of Part 2's placeholder JSON bag.
- `packages/domain/src/academic/year.ts`: `validateAcademicYearRange` (1-730 days, `ends_on > starts_on`) and `deriveFirstDayOfWeek` (Sat-first order).
- `packages/db/src/repositories/school.ts`: `checkEiinAvailability`. `onboarding.ts`'s `saveOnboardingDraft` now always clears `onboarding_progress.completed_at` (D-60 follow-up: a fresh draft after a prior completion is resumable again).
- `packages/ui/src/primitives/`: `segmented-control.tsx`, `day-picker-row.tsx`, `date-field.tsx` (new); `onboarding-shell.tsx` gains an `onBack` handler for in-page step navigation.
- `apps/web/app/(onboarding)/onboarding/create-school/`: the wizard route, steps 1-2 built, stopping at a "more on the way" screen for steps 3-5 (Part 4). The chooser's "Create a school" card is enabled.
