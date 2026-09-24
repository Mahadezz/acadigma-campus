---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/ui": patch
---

F-ID-05 Onboarding, Part 4: the create-school wizard's classes and review steps, and the transaction that creates the school (D-100).

- Migration `20260925100100_create_school_workspace.sql`: `grade_levels` and `academic_years` (T2 RLS), and `public.create_school_workspace(jsonb)` — one SECURITY DEFINER transaction that creates the school (owner, join code, Pro trial via the existing triggers), its profile, current academic year and grade levels, completes onboarding, and records an idempotency key; named errors `EIIN_TAKEN`, `RATE_LIMITED` (3 per day), `INVALID_TIMEZONE`, `INVALID_ACADEMIC_YEAR`, `VALIDATION`, `WORKSPACE_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REUSED`. `supabase/tests/30_create_school_workspace.sql`.
- `packages/domain/src/academic/gradeLevels.ts`: presets (Play–KG, Class 1–12, O/A-Level), ordering, Bangla names, range shortcuts, custom levels.
- `packages/contracts`: `gradeLevelsSchema`, `createSchoolWorkspaceInputSchema`/`Output`; the draft carries `grade_levels` and `idempotency_key`.
- `packages/db`: `createSchoolWorkspace` repository with the error mapping.
- `apps/web`: `createSchoolWorkspace` action (sets the active-workspace cookie, lands on `/app`); wizard step 3 (classes) and step 4 (review and create), en + bn; 44 px inputs on steps 1-2.
- `packages/ui`: `OnboardingShell` takes a localised `progressLabel`.
