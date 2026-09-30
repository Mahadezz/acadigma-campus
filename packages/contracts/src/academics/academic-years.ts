import { z } from "zod"

import { isoDateSchema, uuidSchema } from "../common"

/**
 * F-OP-07 Part 2 (D-210) — academic years, terms and exam weighting under
 * Settings → Academic (§4 W3). Shape only — the day-count/ordering business
 * rule for a year (`validateAcademicYearRange`) and the term gap/overlap and
 * weight-sum rules (`checkTermRange`, `checkExamWeights`) stay in
 * `packages/domain/src/academic/terms.ts` and `year.ts`, the same split
 * `../settings.ts` documents for `school_profiles`.
 *
 * Scope note (D-210): terms and years are add/remove, not edit-in-place —
 * the same shape holidays already use (`../calendar.ts`) — so there is no
 * `updateTerm`/`updateAcademicYear`. Correcting a mistake is delete and
 * re-add; nothing downstream references a term or a non-current year yet.
 */

export const createAcademicYearInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
  })
  .strict()
export type CreateAcademicYearInput = z.infer<
  typeof createAcademicYearInputSchema
>

export const setCurrentAcademicYearInputSchema = z
  .object({ academicYearId: uuidSchema })
  .strict()
export type SetCurrentAcademicYearInput = z.infer<
  typeof setCurrentAcademicYearInputSchema
>

export type AcademicYearSummary = {
  id: string
  name: string
  startsOn: string
  endsOn: string
  isCurrent: boolean
}

export const createTermInputSchema = z
  .object({
    academicYearId: uuidSchema,
    name: z.string().trim().min(1).max(60),
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
  })
  .strict()
export type CreateTermInput = z.infer<typeof createTermInputSchema>

export const deleteTermInputSchema = z.object({ termId: uuidSchema }).strict()
export type DeleteTermInput = z.infer<typeof deleteTermInputSchema>

export type Term = {
  id: string
  academicYearId: string
  name: string
  startsOn: string
  endsOn: string
}

/**
 * The whole weight map for one academic year, replacing it outright — the
 * live-sum form (§4 W3.3) always edits every row together, so a partial
 * patch would leave stale exam ids behind.
 */
export const updateExamWeightsInputSchema = z
  .object({
    academicYearId: uuidSchema,
    weights: z.record(uuidSchema, z.number().min(0).max(100)),
  })
  .strict()
export type UpdateExamWeightsInput = z.infer<
  typeof updateExamWeightsInputSchema
>
