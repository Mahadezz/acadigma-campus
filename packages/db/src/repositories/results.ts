import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type ComputeResultsSummary,
  type Result,
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
  letter: z.string().nullable(),
  result_status: z.enum(["pass", "fail"]),
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
  "student_id, section_id, total_obtained, total_full, percentage, gpa, letter, result_status, " +
  "failed_subjects, section_rank, computed_at, enrollments(roll_number), " +
  "students(student_code, full_name, full_name_bn), " +
  "result_subject_lines(subject_name, subject_name_bn, full_marks, status, obtained, percentage, " +
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
 * One student's computed result, shaped for F-OP-03's `ReportCardDto`
 * (D-206, PR #63's `packages/contracts/src/operations/report-card.ts`) minus
 * `attendance`, which the report-card seam adds from F-AC-03. `rankOf` is the
 * number of ranked students in the section. `examNameBn` is the exam's name
 * (exams have one name); a subject without a Bangla name uses its English one.
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
    marksObtained: number | null
    fullMarks: number
    letter: string | null
    gradePoint: number | null
  }[]
  totalObtained: number
  totalFull: number
  percentage: number
  gpa: number
  overallLetter: string
  result: "pass" | "fail"
  rank: number | null
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
  // Every paper exempt leaves no GPA; the report card has nothing to print.
  if (r.gpa === null || r.percentage === null || r.letter === null) {
    return err(NOT_FOUND)
  }

  const ranked = await client
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .eq("exam_id", examId)
    .eq("section_id", r.section_id)
    .not("section_rank", "is", null)
  if (ranked.error) return err(UNAVAILABLE)

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
    subjects: row.lines.map((l) => ({
      subjectNameEn: l.subjectName,
      subjectNameBn: l.subjectNameBn ?? l.subjectName,
      marksObtained: l.obtained,
      fullMarks: l.fullMarks,
      letter: l.letter,
      gradePoint: l.gradePoint,
    })),
    totalObtained: row.totalObtained,
    totalFull: row.totalFull,
    percentage: r.percentage,
    gpa: r.gpa,
    overallLetter: r.letter,
    result: row.status,
    rank: row.sectionRank,
    rankOf: row.sectionRank === null ? null : (ranked.count ?? null),
  })
}
