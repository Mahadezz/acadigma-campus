import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type ComputeResultsSummary,
  type MarkStatus,
  type Result,
  type ResultStatus,
  type SectionResults,
  type StudentResultRow,
} from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * F-AC-06 Part 5 (demo cut, D-305). `public.compute_results` writes; reads go
 * through RLS (owner/admin/staff, and the section's class teacher).
 */

const UNAVAILABLE = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const NOT_FOUND = apiError("not_found", "No result for this student and exam.")

const COMPUTE_ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError(
    "forbidden",
    "Only an owner or admin can compute results."
  ),
  EXAM_NOT_FOUND: apiError("not_found", "That exam does not exist."),
  MARKS_NOT_LOCKED: apiError(
    "conflict",
    "Lock marks entry before computing results.",
    { fieldErrors: { _root: ["MARKS_NOT_LOCKED"] } }
  ),
  MARKS_INCOMPLETE: apiError(
    "conflict",
    "Every student in every paper needs a mark, or Absent or Exempt, before results can be computed.",
    { fieldErrors: { _root: ["MARKS_INCOMPLETE"] } }
  ),
}

/** §7 computeResults: replaces the exam's results in one transaction. */
export async function computeResults(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  examId: string
): Promise<Result<ComputeResultsSummary, ApiError>> {
  const { data, error } = await client.rpc("compute_results", {
    p_workspace_id: ctx.workspaceId,
    p_exam_id: examId,
  })
  if (error) {
    const known = Object.hasOwn(COMPUTE_ERRORS, error.message)
      ? COMPUTE_ERRORS[error.message]
      : undefined
    return err(known ?? UNAVAILABLE)
  }
  const summary = z
    .object({ computed: z.number(), passed: z.number(), failed: z.number() })
    .safeParse(data)
  return summary.success ? ok(summary.data) : err(UNAVAILABLE)
}

const num = z.coerce.number()
const numOrNull = z.union([z.null(), num])

const lineRow = z.object({
  subject_name: z.string(),
  subject_name_bn: z.string().nullable(),
  full_marks: num,
  status: z.enum(["entered", "absent", "exempt"]),
  subject_kind: z.enum(["compulsory", "optional_fourth"]),
  obtained: numOrNull,
  percentage: numOrNull,
  letter: z.string().nullable(),
  grade_point: numOrNull,
  passed: z.boolean().nullable(),
})

const resultRow = z.object({
  student_id: z.string(),
  section_id: z.string(),
  total_obtained: num,
  total_full: num,
  percentage: numOrNull,
  gpa: numOrNull,
  gpa_without_optional: numOrNull,
  letter: z.string().nullable(),
  result_status: z.enum(["pass", "fail", "incomplete", "withheld"]),
  failed_subjects: z.number(),
  section_rank: z.number().nullable(),
  computed_at: z.string(),
  enrollments: z.object({ roll_number: z.number().nullable() }),
  students: z.object({
    student_code: z.string(),
    full_name: z.string(),
    full_name_bn: z.string().nullable(),
  }),
  result_subject_lines: z.array(lineRow),
})

const RESULT_COLUMNS =
  "student_id, section_id, total_obtained, total_full, percentage, gpa, gpa_without_optional, letter, result_status, " +
  "failed_subjects, section_rank, computed_at, enrollments(roll_number), " +
  "students(student_code, full_name, full_name_bn), " +
  "result_subject_lines(subject_name, subject_name_bn, full_marks, status, subject_kind, obtained, percentage, " +
  "letter, grade_point, passed)"

function toRow(r: z.infer<typeof resultRow>): StudentResultRow {
  return {
    studentId: r.student_id,
    rollNumber: r.enrollments.roll_number,
    fullName: r.students.full_name,
    fullNameBn: r.students.full_name_bn,
    studentCode: r.students.student_code,
    totalObtained: r.total_obtained,
    totalFull: r.total_full,
    percentage: r.percentage,
    gpa: r.gpa,
    letter: r.letter,
    status: r.result_status,
    failedSubjects: r.failed_subjects,
    sectionRank: r.section_rank,
    lines: r.result_subject_lines
      .map((l) => ({
        subjectName: l.subject_name,
        subjectNameBn: l.subject_name_bn,
        fullMarks: l.full_marks,
        status: l.status,
        obtained: l.obtained,
        percentage: l.percentage,
        letter: l.letter,
        gradePoint: l.grade_point,
        passed: l.passed,
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
  }
}

/** The results preview for one section, in rank order (unranked last). */
export async function getSectionResults(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  examId: string,
  sectionId: string
): Promise<Result<SectionResults, ApiError>> {
  const [exam, section, results] = await Promise.all([
    client
      .from("exams")
      .select("id, name")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", examId)
      .maybeSingle(),
    client
      .from("sections")
      .select("id, name, grade_levels(name)")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", sectionId)
      .maybeSingle(),
    client
      .from("results")
      .select(RESULT_COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .eq("exam_id", examId)
      .eq("section_id", sectionId),
  ])
  if (exam.error || section.error || results.error) return err(UNAVAILABLE)
  if (!exam.data || !section.data) {
    return err(apiError("not_found", "That exam or section does not exist."))
  }
  const rows = z.array(resultRow).safeParse(results.data ?? [])
  if (!rows.success) return err(UNAVAILABLE)
  const s = section.data as unknown as {
    id: string
    name: string
    grade_levels: { name: string }
  }
  return ok({
    examId: exam.data.id,
    examName: exam.data.name,
    sectionId: s.id,
    sectionLabel: sectionDisplayName(s.grade_levels.name, s.name),
    computedAt: rows.data[0]?.computed_at ?? null,
    rows: rows.data
      .map(toRow)
      .sort(
        (a, b) =>
          (a.sectionRank ?? Infinity) - (b.sectionRank ?? Infinity) ||
          a.studentCode.localeCompare(b.studentCode)
      ),
  })
}

/**
 * One student's computed result, shaped for F-OP-03's report card (D-206,
 * PR #63's `ReportCardDto` as the lead revised it on 2026-09-26) minus
 * `attendance`, which the report-card seam adds from F-AC-03. Read through the
 * caller's RLS client. `rankOf` is the number of ranked students in the
 * section; `rankTied` is true when another student shares the rank.
 * `examNameBn` is the exam's name (exams have one name); a subject without a
 * Bangla name uses its English one. `gpa`, `overallLetter` and `rank` are null
 * when the result is incomplete or withheld (or every paper was exempt).
 */
export type ReportCardResult = {
  studentNameEn: string
  studentNameBn: string
  studentCode: string
  rollNumber: number | null
  className: string
  sectionName: string
  examNameEn: string
  examNameBn: string
  subjects: {
    subjectNameEn: string
    subjectNameBn: string
    status: MarkStatus
    subjectKind: "compulsory" | "optional_fourth"
    marksObtained: number | null
    fullMarks: number
    letter: string | null
    gradePoint: number | null
  }[]
  totalObtained: number
  totalFull: number
  percentage: number | null
  gpa: number | null
  gpaWithoutOptional: number | null
  overallLetter: string | null
  result: ResultStatus
  rank: number | null
  rankTied: boolean
  rankOf: number | null
}

export async function getReportCardResult(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  studentId: string,
  examId: string
): Promise<Result<ReportCardResult, ApiError>> {
  const { data, error } = await client
    .from("results")
    .select(
      RESULT_COLUMNS + ", exams(name), sections(name, grade_levels(name))"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  const parsed = resultRow
    .extend({
      exams: z.object({ name: z.string() }),
      sections: z.object({
        name: z.string(),
        grade_levels: z.object({ name: z.string() }),
      }),
    })
    .safeParse(data)
  if (!parsed.success) return err(UNAVAILABLE)
  const r = parsed.data

  const sectionCount = (rank?: number) => {
    let query = client
      .from("results")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("exam_id", examId)
      .eq("section_id", r.section_id)
    query =
      rank === undefined
        ? query.not("section_rank", "is", null)
        : query.eq("section_rank", rank)
    return query
  }
  const [ranked, sameRank] = await Promise.all([
    r.section_rank === null ? null : sectionCount(),
    r.section_rank === null ? null : sectionCount(r.section_rank),
  ])
  if (ranked?.error || sameRank?.error) return err(UNAVAILABLE)

  const row = toRow(r)
  return ok({
    studentNameEn: row.fullName,
    studentNameBn: row.fullNameBn ?? row.fullName,
    studentCode: row.studentCode,
    rollNumber: row.rollNumber,
    className: r.sections.grade_levels.name,
    sectionName: r.sections.name,
    examNameEn: r.exams.name,
    examNameBn: r.exams.name,
    subjects: r.result_subject_lines
      .map((l) => ({
        subjectNameEn: l.subject_name,
        subjectNameBn: l.subject_name_bn ?? l.subject_name,
        status: l.status,
        subjectKind: l.subject_kind,
        marksObtained: l.obtained,
        fullMarks: l.full_marks,
        letter: l.letter,
        gradePoint: l.grade_point,
      }))
      .sort((a, b) => a.subjectNameEn.localeCompare(b.subjectNameEn)),
    totalObtained: row.totalObtained,
    totalFull: row.totalFull,
    percentage: row.percentage,
    gpa: row.gpa,
    gpaWithoutOptional: r.gpa_without_optional,
    overallLetter: row.letter,
    result: row.status,
    rank: row.sectionRank,
    rankTied: (sameRank?.count ?? 0) > 1,
    rankOf: ranked?.count ?? null,
  })
}
