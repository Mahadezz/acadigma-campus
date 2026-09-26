import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-AC-06 Part 3 (demo cut, D-304) — marks entry
 * (`supabase/migrations/20260925300312_marks.sql`), §7 `saveMarks`.
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
    /** Required from an owner/admin outside the entry window (D-307). */
    lateReason: z.string().trim().min(1).max(500).optional(),
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
  /** §5.11 effective window (D-307); null = no limit on that side. */
  entryOpensOn: string | null
  entryClosesOn: string | null
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

/** F-AC-06 Part 4 (D-307) — §7 `submitExamSubject`. */
export const submitExamSubjectInputSchema = z
  .object({
    examSubjectId: uuidSchema,
    /** Submit even with students missing (the INCOMPLETE_ENTRY warning). */
    confirmIncomplete: z.boolean().default(false),
  })
  .strict()
export type SubmitExamSubjectInput = z.infer<
  typeof submitExamSubjectInputSchema
>

export type MissingMarkStudent = {
  studentId: string
  fullName: string
  fullNameBn: string | null
  rollNumber: number | null
}

/** `submitted: false` = the warning: nothing changed, `missing` lists who. */
export type SubmitExamSubjectResult = {
  submitted: boolean
  missing: MissingMarkStudent[]
}

/** §7 `lockExamSubject` / `unlockExamSubject` (owner/admin, D-307). */
export const lockExamSubjectInputSchema = z
  .object({ examSubjectId: uuidSchema })
  .strict()
export const unlockExamSubjectInputSchema = z
  .object({
    examSubjectId: uuidSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
export type UnlockExamSubjectInput = z.infer<
  typeof unlockExamSubjectInputSchema
>
