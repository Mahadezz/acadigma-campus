import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-OP-03 Part 6 (D-208) — the exam mark sheet's render DTO and the params
 * `createReportRun` accepts for `kind: 'mark_sheet'`.
 *
 * Built entirely from F-AC-06's already-computed `results` +
 * `result_subject_lines` (via `getSectionResults`, `@acadigma/db`) — same
 * "one grading truth" rule as the report card (spec §5.1): no grade band,
 * pass rule or averaging lives here, only already-computed fields laid out
 * per student x paper instead of one student's own subjects listed as rows.
 *
 * When the exam's results have not been computed at all (`compute_results`
 * never run for this section), there is nothing to lay out — the render is
 * refused with `results_not_computed` (see `getMarkSheetData`) rather than
 * this DTO carrying an empty/placeholder sheet. A student whose own result
 * is `incomplete`/`withheld` still has a row (F-AC-06 already computes one
 * per student, D-305 item 5) — `result` on that row drives the template's
 * "results not computed"/"অসম্পূর্ণ" text, never a missing row.
 */

export const markSheetParamsSchema = z.object({
  kind: z.literal("mark_sheet"),
  sectionId: uuidSchema,
  examId: uuidSchema,
})
export type MarkSheetParams = z.infer<typeof markSheetParamsSchema>

export const markSheetSubjectHeaderSchema = z.object({
  subjectNameEn: z.string().min(1),
  subjectNameBn: z.string().min(1),
  fullMarks: z.number().positive(),
})
export type MarkSheetSubjectHeader = z.infer<
  typeof markSheetSubjectHeaderSchema
>

export const markSheetLineSchema = z.object({
  subjectNameEn: z.string().min(1),
  /** Null: no mark entered yet for this paper. */
  status: z.enum(["entered", "absent", "exempt"]).nullable(),
  obtained: z.number().min(0).nullable(),
  letter: z.string().nullable(),
})
export type MarkSheetLine = z.infer<typeof markSheetLineSchema>

/** F-AC-06 `results.result_status`. */
export const markSheetResultSchema = z.enum([
  "pass",
  "fail",
  "incomplete",
  "withheld",
])
export type MarkSheetResult = z.infer<typeof markSheetResultSchema>

export const markSheetStudentRowSchema = z.object({
  studentId: uuidSchema,
  rollNumber: z.number().int().positive().nullable(),
  studentNameEn: z.string().min(1),
  studentNameBn: z.string().min(1),
  /** One entry per `MarkSheetDto.subjects`, same order/length; matched by
   * `subjectNameEn` when building, so a missing paper for a student prints
   * "-" rather than shifting every later column. */
  lines: z.array(markSheetLineSchema),
  totalObtained: z.number().min(0),
  totalFull: z.number().positive(),
  percentage: z.number().min(0).max(100).nullable(),
  gpa: z.number().min(0).nullable(),
  letter: z.string().nullable(),
  result: markSheetResultSchema,
  rank: z.number().int().positive().nullable(),
})
export type MarkSheetStudentRow = z.infer<typeof markSheetStudentRowSchema>

export const markSheetColumnStatsSchema = z.object({
  subjectNameEn: z.string().min(1),
  highest: z.number().min(0).nullable(),
  lowest: z.number().min(0).nullable(),
  /** `round(mean(obtained), 2)` over students who appeared (spec §5.3). */
  average: z.number().min(0).nullable(),
  passCount: z.number().int().min(0),
  /** Excludes students with no mark row counted at all (exempt or unmarked). */
  appeared: z.number().int().min(0),
  /** `round(passCount / appeared * 100, 1)`; null when nobody appeared. */
  passRate: z.number().min(0).max(100).nullable(),
})
export type MarkSheetColumnStats = z.infer<typeof markSheetColumnStatsSchema>

export const markSheetDtoSchema = z.object({
  /** "Grade – Section" (`sectionDisplayName`, same as the results preview). */
  sectionLabel: z.string().min(1),
  examNameEn: z.string().min(1),
  examNameBn: z.string().min(1),
  subjects: z.array(markSheetSubjectHeaderSchema).min(1),
  students: z.array(markSheetStudentRowSchema).min(1),
  columnStats: z.array(markSheetColumnStatsSchema),
})
export type MarkSheetDto = z.infer<typeof markSheetDtoSchema>
