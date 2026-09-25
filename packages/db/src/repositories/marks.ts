/**
 * F-AC-06 Part 3 (demo cut, D-304) — one paper's marks sheet and the save.
 * Reads go through RLS (a teacher of another subject sees no marks);
 * `public.save_marks` re-checks who, when and every value.
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type MarkSheet,
  type MarkStatus,
  type Result,
  type SaveMarksInput,
  type SaveMarksResult,
} from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const NOT_FOUND = apiError("not_found", "That paper does not exist.")

type PaperRow = {
  id: string
  exam_id: string
  section_id: string
  full_marks: number | string
  pass_marks: number | string
  status: string
  teacher_id: string | null
  exams: { name: string; status: string }
  subjects: { name: string; name_bn: string | null }
  sections: {
    name: string
    class_teacher_id: string | null
    grade_levels: { name: string }
  }
}

type EnrollmentRow = {
  roll_number: number | null
  students: { id: string; full_name: string; full_name_bn: string | null }
}

type MarkRow = {
  student_id: string
  status: MarkStatus
  obtained: number | string | null
  updated_at: string
}

export type MarkSheetWithAccess = MarkSheet & {
  /** Owner/admin, the paper's teacher or the section's class teacher. */
  canEnter: boolean
}

/**
 * The paper, the students enrolled in its section by roll number, and each
 * one's saved mark (or none).
 */
export async function getMarkSheet(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  paperId: string
): Promise<Result<MarkSheetWithAccess, ApiError>> {
  const [paper, member] = await Promise.all([
    client
      .from("exam_subjects")
      .select(
        "id, exam_id, section_id, full_marks, pass_marks, status, teacher_id, " +
          "exams(name, status), subjects(name, name_bn), " +
          "sections(name, class_teacher_id, grade_levels(name))"
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", paperId)
      .maybeSingle(),
    client
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .maybeSingle(),
  ])
  if (paper.error || member.error) return err(UNAVAILABLE)
  if (!paper.data) return err(NOT_FOUND)
  const p = paper.data as unknown as PaperRow

  const [enrollments, marks] = await Promise.all([
    client
      .from("enrollments")
      .select("roll_number, students!inner(id, full_name, full_name_bn)")
      .eq("workspace_id", ctx.workspaceId)
      .eq("section_id", p.section_id)
      .eq("status", "active")
      .eq("students.status", "active")
      .is("students.deleted_at", null)
      .order("roll_number", { ascending: true, nullsFirst: false }),
    client
      .from("marks")
      .select("student_id, status, obtained, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .eq("exam_subject_id", p.id),
  ])
  if (enrollments.error || marks.error) return err(UNAVAILABLE)

  const saved = new Map(
    ((marks.data ?? []) as unknown as MarkRow[]).map((m) => [m.student_id, m])
  )
  const memberId = member.data?.id ?? null
  const canEnter =
    ctx.role === "owner" ||
    ctx.role === "admin" ||
    (ctx.role === "teacher" &&
      memberId !== null &&
      (memberId === p.teacher_id || memberId === p.sections.class_teacher_id))

  return ok({
    paperId: p.id,
    examId: p.exam_id,
    examName: p.exams.name,
    examStatus: p.exams.status,
    paperStatus: p.status,
    sectionLabel: sectionDisplayName(
      p.sections.grade_levels.name,
      p.sections.name
    ),
    subjectName: p.subjects.name,
    subjectNameBn: p.subjects.name_bn,
    fullMarks: Number(p.full_marks),
    passMarks: Number(p.pass_marks),
    canEnter,
    rows: ((enrollments.data ?? []) as unknown as EnrollmentRow[]).map((e) => {
      const m = saved.get(e.students.id)
      return {
        studentId: e.students.id,
        rollNumber: e.roll_number,
        fullName: e.students.full_name,
        fullNameBn: e.students.full_name_bn,
        status: m?.status ?? null,
        obtained: m?.obtained == null ? null : Number(m.obtained),
        updatedAt: m?.updated_at ?? null,
      }
    }),
  })
}

const SAVE_ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError("forbidden", "You cannot enter marks here.", {
    fieldErrors: { _root: ["NOT_ASSIGNED"] },
  }),
  NOT_ASSIGNED: apiError(
    "forbidden",
    "Only this paper's teacher, the class teacher or an admin can enter its marks.",
    { fieldErrors: { _root: ["NOT_ASSIGNED"] } }
  ),
  ENTRY_CLOSED: apiError("conflict", "Marks entry is not open for this exam.", {
    fieldErrors: { _root: ["ENTRY_CLOSED"] },
  }),
  SUBJECT_LOCKED: apiError("forbidden", "This paper is locked.", {
    fieldErrors: { _root: ["SUBJECT_LOCKED"] },
  }),
  STUDENT_NOT_ENROLLED: apiError(
    "conflict",
    "The class list changed. Reload and try again.",
    { fieldErrors: { _root: ["ROSTER_CHANGED"] } }
  ),
  PAPER_NOT_FOUND: NOT_FOUND,
  IDEMPOTENCY_KEY_REUSED: apiError(
    "conflict",
    "This form was already submitted with different marks. Please reload.",
    { fieldErrors: { _root: ["ROSTER_CHANGED"] } }
  ),
  VALIDATION: apiError("validation_failed", "Some of the marks are not valid."),
}

type SaveJson = {
  saved: number
  entered: number
  enrolled: number
  rejected: { student_id: string; issue: "MARK_OUT_OF_RANGE" | "CONFLICT" }[]
  marks: {
    student_id: string
    status: MarkStatus
    obtained: number | string | null
    updated_at: string
  }[]
}

/** §4.2: `public.save_marks` upserts every valid row in one statement. */
export async function saveMarks(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: SaveMarksInput
): Promise<Result<SaveMarksResult, ApiError>> {
  const { data, error } = await client.rpc("save_marks", {
    p_workspace_id: ctx.workspaceId,
    p_input: {
      idempotency_key: input.idempotencyKey,
      exam_subject_id: input.examSubjectId,
      entries: input.entries.map((e) => ({
        student_id: e.studentId,
        status: e.status,
        obtained: e.obtained,
        expected_updated_at: e.expectedUpdatedAt,
      })),
    },
  })
  if (error) {
    const known = Object.hasOwn(SAVE_ERRORS, error.message)
      ? SAVE_ERRORS[error.message]
      : undefined
    return err(known ?? UNAVAILABLE)
  }
  const row = data as unknown as SaveJson
  return ok({
    saved: row.saved,
    entered: row.entered,
    enrolled: row.enrolled,
    rejected: row.rejected.map((r) => ({
      studentId: r.student_id,
      issue: r.issue,
    })),
    marks: row.marks.map((m) => ({
      studentId: m.student_id,
      status: m.status,
      obtained: m.obtained == null ? null : Number(m.obtained),
      updatedAt: m.updated_at,
    })),
  })
}
