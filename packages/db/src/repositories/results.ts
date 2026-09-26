import { z } from "zod"

import {
  apiError,
  err,
  ok,
  reportCardDtoSchema,
  type ApiError,
  type ComputeResultsSummary,
  type AttendanceStatus,
  type FamilyResult,
  type PublishCandidate,
  type PublishResultsSummary,
  type ReportCardDto,
  type Result,
  type SectionResults,
  type StudentResultRow,
} from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"
import { attendanceWeight } from "@acadigma/domain/attendance"
import { roundHalfUp } from "@acadigma/domain/grading"

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
    .object({
      computed: z.number(),
      passed: z.number(),
      failed: z.number(),
      incomplete: z.number(),
    })
    .safeParse(data)
  return summary.success ? ok(summary.data) : err(UNAVAILABLE)
}

const num = z.coerce.number()
const numOrNull = z.union([z.null(), num])

const lineRow = z.object({
  exam_subject_id: z.string(),
  subject_name: z.string(),
  subject_name_bn: z.string().nullable(),
  full_marks: num,
  status: z.enum(["entered", "absent", "exempt"]).nullable(),
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
  "result_subject_lines(exam_subject_id, subject_name, subject_name_bn, full_marks, status, subject_kind, obtained, percentage, " +
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
        paperId: l.exam_subject_id,
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
 * The report card's data (F-OP-03 D-206, `ReportCardDto`): one student's
 * computed result for one exam, read through the CALLER's RLS client — a
 * teacher sees only their own class (`app.can_read_results`), so any other
 * student is `not_found`. Attendance is the student's records from the
 * year's first day to the exam's last day (or today), weighted by the
 * school's policy (F-AC-03 §5.4), as a whole percentage; below
 * `min_attendance_bp` (default 75 %) is a warning line, never a block.
 * `examNameBn` is the exam's name (exams have one name); a subject without a
 * Bangla name uses its English one. A student without a roll number, or
 * whose every paper was exempt, has no card to print.
 */
export async function getReportCard(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  studentId: string,
  examId: string
): Promise<Result<ReportCardDto, ApiError>> {
  // A published result prints from its frozen payload (§5.14, D-306): what
  // the family was shown, whatever changed since. A parent can only ever
  // reach this branch — RLS shows them published results only.
  const frozen = await client
    .from("results")
    .select("frozen_payload")
    .eq("workspace_id", ctx.workspaceId)
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .maybeSingle()
  if (frozen.error) return err(UNAVAILABLE)
  if (!frozen.data) return err(NOT_FOUND)
  if (frozen.data.frozen_payload !== null) {
    const card = reportCardDtoSchema.safeParse(frozen.data.frozen_payload)
    return card.success ? ok(card.data) : err(UNAVAILABLE)
  }

  const { data, error } = await client
    .from("results")
    .select(
      RESULT_COLUMNS +
        ", exams(name, ends_on, academic_years(starts_on)), sections(name, grade_levels(name))"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("exam_id", examId)
    .eq("student_id", studentId)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  const parsed = resultRow
    .extend({
      exams: z.object({
        name: z.string(),
        ends_on: z.string().nullable(),
        academic_years: z.object({ starts_on: z.string() }),
      }),
      sections: z.object({
        name: z.string(),
        grade_levels: z.object({ name: z.string() }),
      }),
    })
    .safeParse(data)
  if (!parsed.success) return err(UNAVAILABLE)
  const r = parsed.data
  const row = toRow(r)
  if (row.percentage === null) {
    return err(
      apiError(
        "not_found",
        "This student has no report card to print: no paper counts yet."
      )
    )
  }

  const upTo = r.exams.ends_on ?? new Date().toISOString().slice(0, 10)
  const sectionCount = (rank?: number) => {
    const query = client
      .from("results")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("exam_id", examId)
      .eq("section_id", r.section_id)
    return rank === undefined
      ? query.not("section_rank", "is", null)
      : query.eq("section_rank", rank)
  }
  const [ranked, sameRank, records, policy] = await Promise.all([
    sectionCount(),
    row.sectionRank === null ? null : sectionCount(row.sectionRank),
    client
      .from("attendance_records")
      .select("status, attendance_sessions!inner(date)")
      .eq("workspace_id", ctx.workspaceId)
      .eq("student_id", studentId)
      .gte("attendance_sessions.date", r.exams.academic_years.starts_on)
      .lte("attendance_sessions.date", upTo),
    client
      .from("school_profiles")
      .select("attendance_policy")
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle(),
  ])
  if (ranked.error || sameRank?.error || records.error || policy.error) {
    return err(UNAVAILABLE)
  }

  const rules = z
    .object({
      late_counts_present: z.boolean().default(true),
      half_day_counts_present: z.boolean().default(true),
      min_attendance_bp: z.number().default(7500),
    })
    .catch({
      late_counts_present: true,
      half_day_counts_present: true,
      min_attendance_bp: 7500,
    })
    .parse(policy.data?.attendance_policy ?? {})
  const statuses = (records.data ?? []).map(
    (rec) => (rec as { status: AttendanceStatus }).status
  )
  const presentDays = statuses.reduce(
    (sum, status) => sum + attendanceWeight(status, rules),
    0
  )
  const percent =
    statuses.length === 0
      ? null
      : roundHalfUp((100 * presentDays) / statuses.length, 0)

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
        subjectKind: l.subject_kind,
        // A paper with no mark yet prints "—" (an `entered` line with no mark).
        status: l.status ?? "entered",
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
    rankOf: ranked.count || null,
    attendance: {
      presentDays,
      totalDays: statuses.length,
      percent,
      belowMinimum: percent !== null && percent * 100 < rules.min_attendance_bp,
    },
  })
}

const PUBLISH_ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError(
    "forbidden",
    "Only an owner or admin can publish results."
  ),
  EXAM_NOT_FOUND: apiError("not_found", "That exam does not exist."),
  MARKS_NOT_LOCKED: apiError(
    "conflict",
    "Results can be published only from Marks locked.",
    { fieldErrors: { _root: ["MARKS_NOT_LOCKED"] } }
  ),
  MARKS_INCOMPLETE: apiError(
    "conflict",
    "Every student in every paper needs a mark, or Absent or Exempt, before results can be published.",
    { fieldErrors: { _root: ["MARKS_INCOMPLETE"] } }
  ),
  NOT_COMPUTED: apiError(
    "conflict",
    "Compute results before publishing them.",
    { fieldErrors: { _root: ["NOT_COMPUTED"] } }
  ),
  INCOMPLETE_PRESENT: apiError(
    "conflict",
    "Some results are incomplete. Compute results again, then publish.",
    { fieldErrors: { _root: ["INCOMPLETE_PRESENT"] } }
  ),
  VALIDATION: apiError(
    "validation_failed",
    "Each withheld student needs a reason.",
    { fieldErrors: { withhold: ["VALIDATION"] } }
  ),
  PLAN_READ_ONLY: apiError(
    "forbidden",
    "This school is read-only. Upgrade to publish results."
  ),
}

/**
 * §7 publishResults (D-306): freezes every result of the exam and publishes
 * it; the withheld students' results stay hidden from their families.
 */
export async function publishResults(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  examId: string,
  withhold: { studentId: string; reason: string }[]
): Promise<Result<PublishResultsSummary, ApiError>> {
  const { data, error } = await client.rpc("publish_results", {
    p_workspace_id: ctx.workspaceId,
    p_exam_id: examId,
    p_withhold: withhold.map((w) => ({
      student_id: w.studentId,
      reason: w.reason,
    })),
  })
  if (error) {
    const known = Object.hasOwn(PUBLISH_ERRORS, error.message)
      ? PUBLISH_ERRORS[error.message]
      : undefined
    return err(known ?? UNAVAILABLE)
  }
  const summary = z
    .object({ published: z.number(), withheld: z.number() })
    .safeParse(data)
  return summary.success ? ok(summary.data) : err(UNAVAILABLE)
}

/** The publish sheet's list: every student with a result in the exam. */
export async function listPublishCandidates(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  examId: string
): Promise<Result<PublishCandidate[], ApiError>> {
  const { data, error } = await client
    .from("results")
    .select(
      "student_id, result_status, enrollments(roll_number), students(full_name), sections(name, grade_levels(name))"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("exam_id", examId)
  if (error) return err(UNAVAILABLE)
  const rows = z
    .array(
      z.object({
        student_id: z.string(),
        result_status: resultRow.shape.result_status,
        enrollments: z.object({ roll_number: z.number().nullable() }),
        students: z.object({ full_name: z.string() }),
        sections: z.object({
          name: z.string(),
          grade_levels: z.object({ name: z.string() }),
        }),
      })
    )
    .safeParse(data ?? [])
  if (!rows.success) return err(UNAVAILABLE)
  return ok(
    rows.data
      .map((r) => ({
        studentId: r.student_id,
        fullName: r.students.full_name,
        sectionLabel: sectionDisplayName(
          r.sections.grade_levels.name,
          r.sections.name
        ),
        rollNumber: r.enrollments.roll_number,
        status: r.result_status,
      }))
      .sort(
        (a, b) =>
          a.sectionLabel.localeCompare(b.sectionLabel) ||
          (a.rollNumber ?? Infinity) - (b.rollNumber ?? Infinity)
      )
  )
}

/**
 * F-AC-10 results tab (D-306): the caller's children's published results,
 * newest first, from their frozen payloads. RLS returns a parent only their
 * own linked children's published, non-withheld results.
 */
export async function listFamilyResults(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<FamilyResult[], ApiError>> {
  const { data, error } = await client
    .from("results")
    .select("exam_id, student_id, published_at, frozen_payload")
    .eq("workspace_id", ctx.workspaceId)
    .eq("published", true)
    .order("published_at", { ascending: false })
  if (error) return err(UNAVAILABLE)
  const rows = z
    .array(
      z.object({
        exam_id: z.string(),
        student_id: z.string(),
        published_at: z.string(),
        frozen_payload: reportCardDtoSchema,
      })
    )
    .safeParse(data ?? [])
  if (!rows.success) return err(UNAVAILABLE)
  return ok(
    rows.data.map((r) => ({
      examId: r.exam_id,
      studentId: r.student_id,
      publishedAt: r.published_at,
      card: r.frozen_payload,
    }))
  )
}
