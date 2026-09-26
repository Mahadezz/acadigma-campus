import { z } from "zod"

import { uuidSchema } from "../common"

import type { MarkStatus } from "./marks"

/**
 * F-AC-06 Part 5 (demo cut, D-305) — results
 * (`supabase/migrations/20260925300318_results.sql`), §7 `computeResults`.
 */

export const computeResultsInputSchema = z
  .object({ examId: uuidSchema })
  .strict()
export type ComputeResultsInput = z.infer<typeof computeResultsInputSchema>

/** Only pass/fail are produced today; incomplete and withheld arrive with
 * force-absent (Part 4) and withholding (Part 7). */
export type ResultStatus = "pass" | "fail" | "incomplete" | "withheld"

export type ComputeResultsSummary = {
  computed: number
  passed: number
  failed: number
  incomplete: number
}

/** One paper's line on a student's result (the mark-sheet row). */
export type ResultLine = {
  /** The paper (exam_subjects.id). */
  paperId: string
  subjectName: string
  subjectNameBn: string | null
  fullMarks: number
  /** Null: no mark entered yet. */
  status: MarkStatus | null
  /** Null when absent or exempt. */
  obtained: number | null
  /** 0 when absent, null when exempt. */
  percentage: number | null
  letter: string | null
  gradePoint: number | null
  /** Null when exempt. */
  passed: boolean | null
}

export type StudentResultRow = {
  studentId: string
  rollNumber: number | null
  fullName: string
  fullNameBn: string | null
  studentCode: string
  totalObtained: number
  totalFull: number
  percentage: number | null
  gpa: number | null
  letter: string | null
  status: ResultStatus
  failedSubjects: number
  sectionRank: number | null
  lines: ResultLine[]
}

/** The results preview for one section of one exam, in rank order. */
export type SectionResults = {
  examId: string
  examName: string
  sectionId: string
  sectionLabel: string
  computedAt: string | null
  rows: StudentResultRow[]
}
