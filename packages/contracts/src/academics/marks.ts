import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-AC-06 Part 3 (demo cut, D-304) — marks entry
 * (`supabase/migrations/20260925300311_marks.sql`), §7 `saveMarks`.
 */

export const markStatusSchema = z.enum(["entered", "absent", "exempt"])
export type MarkStatus = z.infer<typeof markStatusSchema>

/** Per-row issues `public.save_marks` returns; the other rows still save. */
export const markIssueSchema = z.enum(["MARK_OUT_OF_RANGE", "CONFLICT"])
export type MarkIssue = z.infer<typeof markIssueSchema>

export const markEntrySchema = z
  .object({
    studentId: uuidSchema,
    status: markStatusSchema,
    obtained: z.number().min(0).max(1000).multipleOf(0.01).nullable(),
    /** The row's `updated_at` when the screen loaded it; null for a new row. */
    expectedUpdatedAt: z.string().max(40).nullable(),
  })
  .strict()
  .refine((e) => (e.status === "entered") === (e.obtained !== null), {
    message: "A mark needs a number; absent and exempt have none.",
    path: ["obtained"],
  })
export type MarkEntry = z.infer<typeof markEntrySchema>

export const saveMarksInputSchema = z
  .object({
    idempotencyKey: uuidSchema,
    examSubjectId: uuidSchema,
    entries: z.array(markEntrySchema).min(1).max(300),
  })
  .strict()
export type SaveMarksInput = z.infer<typeof saveMarksInputSchema>

export type SavedMark = {
  studentId: string
  status: MarkStatus
  obtained: number | null
  updatedAt: string
}

export type SaveMarksResult = {
  saved: number
  entered: number
  enrolled: number
  rejected: { studentId: string; issue: MarkIssue }[]
  marks: SavedMark[]
}

/** One student on the marks entry screen, with the saved mark if any. */
export type MarkSheetRow = {
  studentId: string
  rollNumber: number | null
  fullName: string
  fullNameBn: string | null
  status: MarkStatus | null
  obtained: number | null
  updatedAt: string | null
}

export type MarkSheet = {
  paperId: string
  examId: string
  examName: string
  examStatus: string
  paperStatus: string
  sectionLabel: string
  subjectName: string
  subjectNameBn: string | null
  fullMarks: number
  passMarks: number
  rows: MarkSheetRow[]
}
