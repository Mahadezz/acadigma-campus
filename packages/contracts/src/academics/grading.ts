import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-AC-06 Part 1 — grade scales (`grade_scales`, `grade_bands`,
 * `supabase/migrations/20260925300202_grade_scales.sql`) and the two §7
 * contracts Part 1 builds: `upsertGradeScale` (edit an existing scale's
 * name and bands — `saveGradeScaleInputSchema`) and `seedBdGradeScale`.
 * Coverage (no gap / no overlap, 0-100) is checked by the domain
 * (`checkCoverage`) in the action and again by the database.
 */

const percentSchema = z.number().min(0).max(100).multipleOf(0.01)

export const gradeBandSchema = z.object({
  letter: z.string().trim().min(1).max(5),
  minPercent: percentSchema,
  maxPercent: percentSchema,
  gradePoint: z.number().min(0).max(9.99).multipleOf(0.01),
  isFail: z.boolean(),
  sortOrder: z.number().int().min(0).max(100),
})
export type GradeBandDto = z.infer<typeof gradeBandSchema>

export const gradeScaleSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  bands: z.array(gradeBandSchema),
})
export type GradeScaleDto = z.infer<typeof gradeScaleSchema>

export const saveGradeScaleInputSchema = z
  .object({
    scaleId: uuidSchema,
    name: z.string().trim().min(1).max(100),
    bands: z.array(gradeBandSchema).min(1).max(20),
  })
  .refine(
    (v) =>
      new Set(v.bands.map((b) => b.letter.toUpperCase())).size ===
      v.bands.length,
    { message: "Each letter can be used once.", path: ["bands"] }
  )
export type SaveGradeScaleInput = z.infer<typeof saveGradeScaleInputSchema>
