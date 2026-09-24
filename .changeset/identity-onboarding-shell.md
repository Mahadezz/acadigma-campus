---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/ui": minor
---

F-ID-05 Onboarding, Part 2: the `/onboarding` shell, chooser and state.

- Migration `20260925000300_onboarding_progress.sql`: `onboarding_progress` (one row per user, resumable wizard state), class-U1 RLS with no DELETE at all and an added platform-staff SELECT branch for support; `supabase/tests/16_onboarding_progress.sql` (cross-user isolation, no-delete grant, platform-staff read, the `updated_at` trigger).
- `packages/contracts/src/identity/onboarding.ts`: `getOnboardingState`/`saveOnboardingDraft`/`completeOnboarding` schemas; the wizard draft stays a size-capped JSON bag until Parts 3-4 introduce the real `CreateSchoolDraft` shape.
- `packages/domain/src/onboarding/`: three pure, unit-tested functions — `resolveOnboardingAccess` (the redirect matrix), `resolveOnboardingChooserView` (fresh vs. resume), `resolveOnboardingExitRoute` (F-ID-05 §4.5's landing table).
- `packages/db/src/repositories/onboarding.ts`: `getOnboardingProgress`, `saveOnboardingDraft`, `markOnboardingComplete` — all keyed on the caller's own `userId`, never a `WorkspaceContext` (onboarding runs before any membership exists).
- `packages/ui/src/primitives/onboarding-shell.tsx` and `choice-card.tsx`: the frame and the 120px option cards every onboarding screen (this Part's chooser, and Parts 3-4's wizard) render inside.
- `apps/web/app/(onboarding)/`: the chooser at `/onboarding` — two `ChoiceCard`s, the tutoring exit link (`completeOnboarding({exit:"personal"})` → `/personal`), and the forced-access gate for signed-out/unverified visitors.
