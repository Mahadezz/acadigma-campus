import { z } from "zod"

import { isoDateSchema, uuidSchema } from "../common"

/**
 * F-AC-06 Part 2 (demo cut, D-303) — exams and papers
 * (`supabase/migrations/20260925300305_exams.sql`). §7 `createExam`,
 * `setExamStatus` and `upsertExamSubject` (here: update an existing paper;
 * papers are created by `createExam`).
 */

export const examTypeSchema = z.enum([
  "class_test",
  "midterm",
  "term_final",
  "annual",
  "model_test",
  "practical",
  "other",
])
export type ExamType = z.infer<typeof examTypeSchema>

export const examStatusSchema = z.enum([
  "draft",
  "scheduled",
  "in_progress",
  "marks_entry",
  "marks_locked",
  "published",
  "archived",
])

export const examSubjectStatusSchema = z.enum([
  "pending",
  "entering",
  "submitted",
  "locked",
])

const marksSchema = z.number().min(0).max(1000).multipleOf(0.01)

export const createExamInputSchema = z
  .object({
    academicYearId: uuidSchema,
    name: z.string().trim().min(1).max(120),
    examType: examTypeSchema,
    startsOn: isoDateSchema.nullable(),
    endsOn: isoDateSchema.nullable(),
    sectionIds: z.array(uuidSchema).min(1).max(100),
    subjectIds: z.array(uuidSchema).min(1).max(40),
    fullMarks: marksSchema.positive().default(100),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    message: "The exam cannot end before it starts.",
    path: ["endsOn"],
  })
export type CreateExamInput = z.input<typeof createExamInputSchema>
export type CreateExamParsed = z.output<typeof createExamInputSchema>

export const setExamStatusInputSchema = z.object({
  examId: uuidSchema,
  status: examStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
})
export type SetExamStatusInput = z.infer<typeof setExamStatusInputSchema>

export const updateExamSubjectInputSchema = z
  .object({
    id: uuidSchema,
    examDate: isoDateSchema.nullable(),
    fullMarks: marksSchema.positive(),
    passMarks: marksSchema,
    /** The paper's subject teacher (D-304); null clears it, omitted keeps it. */
    teacherId: uuidSchema.nullable().optional(),
  })
  .refine((v) => v.passMarks <= v.fullMarks, {
    message: "Pass marks cannot be more than full marks.",
    path: ["passMarks"],
  })
export type UpdateExamSubjectInput = z.infer<
  typeof updateExamSubjectInputSchema
>

export const examSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  examType: examTypeSchema,
  status: examStatusSchema,
  startsOn: isoDateSchema.nullable(),
  endsOn: isoDateSchema.nullable(),
  paperCount: z.number().int(),
})
export type ExamSummary = z.infer<typeof examSummarySchema>

export const examPaperSchema = z.object({
  id: uuidSchema,
  sectionId: uuidSchema,
  sectionLabel: z.string(),
  subjectName: z.string(),
  subjectNameBn: z.string().nullable(),
  examDate: isoDateSchema.nullable(),
  fullMarks: z.number(),
  passMarks: z.number(),
  status: examSubjectStatusSchema,
  teacherId: uuidSchema.nullable(),
  /** Students with a mark, absent or exempt / students enrolled (D-304). */
  marksDone: z.number().int(),
  enrolled: z.number().int(),
})
export type ExamPaper = z.infer<typeof examPaperSchema>

export const examDetailSchema = examSummarySchema.extend({
  statusReason: z.string().nullable(),
  gradeScaleName: z.string().nullable(),
  passMarkPercent: z.number().nullable(),
  papers: z.array(examPaperSchema),
})
export type ExamDetail = z.infer<typeof examDetailSchema>
