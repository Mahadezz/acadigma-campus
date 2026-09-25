import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-OP-03 Part 3 (D-206) — the report card's render DTO and the params
 * `createReportRun` accepts for `kind: 'report_card'`.
 *
 * `ReportCardDto` is the ONLY shape `packages/pdf`'s report-card template
 * reads. Every grade letter, grade point, GPA and rank on it is already
 * computed by whoever builds the DTO — spec §5.1: "packages/pdf contains no
 * grade band table, no percentage-to-letter map and no averaging code." The
 * template just lays the values out; it re-derives nothing.
 *
 * `ReportCardDto` carries only academic/student data — no school branding.
 * Branding (`schoolName`, `headerLines`, `accentColor`, `footerNote`, the
 * logo) is read live from `school_profiles` at render time, the same way
 * `SampleDocument`'s caller already does (`document-shell.tsx`'s file
 * header: this package never fetches its own data). The two are merged into
 * `ReportCardDocumentProps` only inside `packages/pdf`.
 *
 * Today (D-206) the DTO is built by a fixture, not a real marks query — see
 * the seam comment on `getReportCardData` in
 * `apps/web/app/(school)/app/reports/report-card-data.ts`. Real exam/marks
 * data (F-AC-06 marks entry) is not on `main` yet. `studentId`/`examId`
 * below are still real uuids so the params shape does not change when the
 * seam is swapped for a real query.
 */

// ---------------------------------------------------------------------------
// The render DTO
// ---------------------------------------------------------------------------

/** One subject's row on the printed card, shaped like F-AC-06's
 * `result_subject_lines` (§5.7 rule 8: a missing mark is `null`, never `0`).
 * `status` is the line's `entered|absent|exempt`; an `entered` line with a
 * `null` mark is not marked yet and prints "—", an `absent` line prints
 * "অনুপস্থিত"/"Absent". */
export const reportCardSubjectRowSchema = z.object({
  subjectNameEn: z.string().min(1),
  subjectNameBn: z.string().min(1),
  subjectKind: z.enum(["compulsory", "optional_fourth"]),
  status: z.enum(["entered", "absent", "exempt"]),
  marksObtained: z.number().min(0).nullable(),
  fullMarks: z.number().positive(),
  /** From `app.band_for`/`bandFor` (#46, D-302) — null only when `marksObtained` is null. */
  letter: z.string().nullable(),
  gradePoint: z.number().nullable(),
})
export type ReportCardSubjectRow = z.infer<typeof reportCardSubjectRowSchema>

export const reportCardAttendanceSchema = z.object({
  presentDays: z.number().int().min(0),
  totalDays: z.number().int().min(0),
  /** `round(present / total * 100)`, §5.2. */
  percent: z.number().min(0).max(100),
  /** True when `percent` is below the school's minimum (§5.2 default 75) — a
   * warning line, never a block. */
  belowMinimum: z.boolean(),
})
export type ReportCardAttendance = z.infer<typeof reportCardAttendanceSchema>

/** F-AC-06 `results.result_status`. */
export const reportCardResultSchema = z.enum([
  "pass",
  "fail",
  "incomplete",
  "withheld",
])
export type ReportCardResult = z.infer<typeof reportCardResultSchema>

export const reportCardDtoSchema = z
  .object({
    studentNameEn: z.string().min(1),
    studentNameBn: z.string().min(1),
    studentCode: z.string().min(1),
    rollNumber: z.number().int().positive(),
    className: z.string().min(1),
    sectionName: z.string().min(1),

    examNameEn: z.string().min(1),
    examNameBn: z.string().min(1),

    subjects: z.array(reportCardSubjectRowSchema).min(1),

    totalObtained: z.number().min(0),
    totalFull: z.number().positive(),
    percentage: z.number().min(0).max(100),
    gpa: z.number().min(0).nullable(),
    /** GPA without the 4th subject's bonus; null when there is no 4th subject. */
    gpaWithoutOptional: z.number().min(0).nullable(),
    overallLetter: z.string().min(1).nullable(),
    result: reportCardResultSchema,
    rank: z.number().int().positive().nullable(),
    /** Shares its rank with another student: prints "২ (সমান)" / "2 (tied)". */
    rankTied: z.boolean(),
    rankOf: z.number().int().positive().nullable(),

    attendance: reportCardAttendanceSchema,
  })
  .refine(
    (dto) =>
      (dto.result !== "incomplete" && dto.result !== "withheld") ||
      (dto.gpa === null && dto.overallLetter === null && dto.rank === null),
    {
      message: "An incomplete or withheld result has no GPA, grade or rank.",
      path: ["result"],
    }
  )
export type ReportCardDto = z.infer<typeof reportCardDtoSchema>

// ---------------------------------------------------------------------------
// createReportRun params for kind: 'report_card'
// ---------------------------------------------------------------------------

export const reportCardParamsSchema = z.object({
  kind: z.literal("report_card"),
  studentId: uuidSchema,
  examId: uuidSchema,
})
export type ReportCardParams = z.infer<typeof reportCardParamsSchema>
