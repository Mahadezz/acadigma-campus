import { z } from "zod"

import { isoDateTimeSchema } from "../common"

import { membershipSummarySchema } from "./workspace"

/**
 * F-ID-05 §7 "Server contracts" — Part 2's slice only: `getOnboardingState`,
 * `saveOnboardingDraft`, `completeOnboarding`. `createSchoolWorkspace`,
 * `getFirstRunChecklist`, `dismissFirstRunChecklist` and the join-code
 * actions belong to Parts 3-5 and are not modelled here.
 */

export const onboardingPathSchema = z.enum([
  "undecided",
  "create_school",
  "join_school",
])
export type OnboardingPathValue = z.infer<typeof onboardingPathSchema>

/** `onboarding_progress.step`, 1-5 (§3). */
export const onboardingStepSchema = z.number().int().min(1).max(5)

/**
 * The wizard's partially filled draft (§3 `onboarding_progress.draft`, §7
 * `SaveOnboardingDraftInput.draft: CreateSchoolDraft`, "all fields
 * optional"). Parts 3-4 introduce the real, fully-typed `CreateSchoolDraft`
 * schema (name/eiin/board/timezone/...); until those Parts exist there is no
 * wizard shape to validate against, so this stays a size-capped bag of JSON —
 * "a partially filled draft never fails validation" (§10) holds by
 * construction rather than by chasing every wizard field through two Parts
 * of churn. Wire-compatible: a later `CreateSchoolDraft` object schema still
 * parses whatever is already stored under this one.
 */
export const onboardingDraftSchema = z
  .record(z.string(), z.unknown())
  .refine((draft) => JSON.stringify(draft).length <= 32_000, {
    message: "This draft is too large to save.",
  })
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>

// ---------------------------------------------------------------------------
// getOnboardingState
// ---------------------------------------------------------------------------
export const getOnboardingStateInputSchema = z.object({})
export type GetOnboardingStateInput = z.infer<
  typeof getOnboardingStateInputSchema
>

export const getOnboardingStateOutputSchema = z.object({
  path: onboardingPathSchema,
  step: onboardingStepSchema,
  draft: onboardingDraftSchema,
  memberships: z.array(membershipSummarySchema),
  completedAt: isoDateTimeSchema.nullable(),
})
export type GetOnboardingStateOutput = z.infer<
  typeof getOnboardingStateOutputSchema
>

// ---------------------------------------------------------------------------
// saveOnboardingDraft
// ---------------------------------------------------------------------------
export const saveOnboardingDraftInputSchema = z.object({
  path: onboardingPathSchema,
  step: onboardingStepSchema,
  draft: onboardingDraftSchema,
})
export type SaveOnboardingDraftInput = z.infer<
  typeof saveOnboardingDraftInputSchema
>

export const saveOnboardingDraftOutputSchema = z.object({
  savedAt: isoDateTimeSchema,
})
export type SaveOnboardingDraftOutput = z.infer<
  typeof saveOnboardingDraftOutputSchema
>

// ---------------------------------------------------------------------------
// completeOnboarding
// ---------------------------------------------------------------------------
export const onboardingExitSchema = z.enum(["personal", "created", "joined"])
export type OnboardingExitValue = z.infer<typeof onboardingExitSchema>

export const completeOnboardingInputSchema = z.object({
  exit: onboardingExitSchema,
})
export type CompleteOnboardingInput = z.infer<
  typeof completeOnboardingInputSchema
>

export const completeOnboardingOutputSchema = z.object({
  landingRoute: z.string(),
})
export type CompleteOnboardingOutput = z.infer<
  typeof completeOnboardingOutputSchema
>
