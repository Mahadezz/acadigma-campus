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
- `packages/ui/src/primitives/onboarding-shell.tsx` gains an `onBack` handler for in-page step navigation, plus a forwarded ref to its `<h1>` so a step transition can move focus to it.

**PR #34 review follow-ups** (D-67):

- Migration `20260925000800_throttle_eiin_check_bucket.sql`: `public.throttle_record_failure` gains an `eiinCheck` bucket (30 attempts / 15 min / 15 min block, per user id) — `checkEiinAvailability` was previously unthrottled, letting a signed-in account enumerate which EIINs are already on the platform.
- `packages/ui/src/components/ui/toggle.tsx` / `toggle-group.tsx` (new, shadcn `new-york-v4`): the wizard's medium picker and working-days picker now use `ToggleGroup` (`type="single"` / `type="multiple"`) instead of the hand-rolled `segmented-control.tsx` / `day-picker-row.tsx` (removed) — Radix's roving tabindex also fixes a REACT HIGH finding (`SegmentedControl` gave every option `tabIndex=0` before a value was chosen). The timezone field is now a shadcn combobox (`Command` inside `Popover`, real search) with `Asia/Dhaka` pinned first, replacing the plain ~400-entry `Select` (OPUS 3: unusable on touch). `primitives/date-field.tsx` (removed) is a plain `Input type="date"` inside `FormControl`.
- `wizard.tsx`: focuses each step's `<h1>` on mount (REACT HIGH: no focus management on step change); `backLabel` is now threaded through from `common.actions.back` (OPUS 1: Bengali saw the hardcoded English default); the `eiinChecking` message is wired to a live async state instead of sitting unused; the "Use {timezone}" button, EIIN helper `<summary>` and the "contact support" link all gained `min-h-11` (OPUS 2, 44px touch targets); the academic-year date range's manual cross-field error is now a real RHF error (`form.setError`/`clearErrors`) so it both has a valid described-by id and clears itself the moment either date is edited (OPUS 6).
