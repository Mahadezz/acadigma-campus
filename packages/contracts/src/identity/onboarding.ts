import { z } from "zod"

import { isoDateTimeSchema } from "../common"

import { createSchoolDraftSchema } from "./school"
import { membershipSummarySchema } from "./workspace"

/**
 * F-ID-05 §7 "Server contracts" — Part 2's slice plus Part 3's draft schema:
 * `getOnboardingState`, `saveOnboardingDraft`, `completeOnboarding`.
 * `createSchoolWorkspace`, `getFirstRunChecklist`, `dismissFirstRunChecklist`
 * and the join-code actions belong to Parts 4-5 and are not modelled here.
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
 * optional"). F-ID-05 Part 3 introduces the real, fully-typed
 * `CreateSchoolDraft` schema (`./school.ts`) — every field optional and
 * `.passthrough()`, so "a partially filled draft never fails validation"
 * (§10) still holds, and a later Part 4 draft carrying `grade_levels`/
 * `logo_url` still parses under this same schema. Part 2 shipped this as a
 * plain size-capped `z.record` bag before the wizard existed to validate
 * against; the 32 KB cap itself is unchanged and still mirrors the
 * `onboarding_progress_draft_check` CHECK constraint at the database layer.
 */
export const onboardingDraftSchema = createSchoolDraftSchema.refine(
  (draft) => JSON.stringify(draft).length <= 32_000,
  { message: "This draft is too large to save." }
)
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
