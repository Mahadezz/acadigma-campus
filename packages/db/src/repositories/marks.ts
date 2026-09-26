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
  type SubmitExamSubjectResult,
} from "@acadigma/contracts"
import { marksEntryWindow, sectionDisplayName } from "@acadigma/domain/academic"

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
  exam_date: string | null
  entry_opens_on: string | null
  entry_closes_on: string | null
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
  /** Owner/admin or the paper's own teacher (D-307). */
  canSubmit: boolean
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
          "exam_date, entry_opens_on, entry_closes_on, " +
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
  const isAdmin = ctx.role === "owner" || ctx.role === "admin"
  const canEnter =
    isAdmin ||
    (ctx.role === "teacher" &&
      memberId !== null &&
      (memberId === p.teacher_id || memberId === p.sections.class_teacher_id))
  const window = marksEntryWindow({
    examDate: p.exam_date,
    entryOpensOn: p.entry_opens_on,
    entryClosesOn: p.entry_closes_on,
  })

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
    canSubmit:
      isAdmin ||
      (ctx.role === "teacher" &&
        memberId !== null &&
        memberId === p.teacher_id),
    entryOpensOn: window.opensOn,
    entryClosesOn: window.closesOn,
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
  OUTSIDE_ENTRY_WINDOW: apiError(
    "forbidden",
    "Marks entry for this paper is closed. Ask an admin.",
    { fieldErrors: { _root: ["OUTSIDE_ENTRY_WINDOW"] } }
  ),
  REASON_REQUIRED: apiError("validation_failed", "Give a reason.", {
    fieldErrors: { _root: ["REASON_REQUIRED"] },
  }),
  ALREADY_LOCKED: apiError("conflict", "This paper is already locked.", {
    fieldErrors: { _root: ["ALREADY_LOCKED"] },
  }),
  NOT_SUBMITTED: apiError("conflict", "Only a submitted paper can be locked.", {
    fieldErrors: { _root: ["NOT_SUBMITTED"] },
  }),
  NOT_LOCKED: apiError("conflict", "This paper is not locked.", {
    fieldErrors: { _root: ["NOT_LOCKED"] },
  }),
  EXAM_PUBLISHED: apiError(
    "conflict",
    "Results are published. Unpublish them before unlocking a paper.",
    { fieldErrors: { _root: ["EXAM_PUBLISHED"] } }
  ),
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
      late_reason: input.lateReason,
      entries: input.entries.map((e) => ({
        student_id: e.studentId,
        status: e.status,
        obtained: e.obtained,
        expected_updated_at: e.expectedUpdatedAt,
      })),
    },
  })
  if (error) return err(fromDbError(error))
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

function fromDbError(error: { message: string }): ApiError {
  return (
    (Object.hasOwn(SAVE_ERRORS, error.message)
      ? SAVE_ERRORS[error.message]
      : undefined) ?? UNAVAILABLE
  )
}

type SubmitJson = {
  submitted: boolean
  missing: {
    student_id: string
    full_name: string
    full_name_bn: string | null
    roll_number: number | null
  }[]
}

/**
 * §7 `submitExamSubject` (D-307): `public.submit_exam_subject` checks the
 * paper's teacher or owner/admin. With students missing and no
 * confirmation nothing changes and `submitted` is false (the warning).
 */
export async function submitExamSubject(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  paperId: string,
  confirmIncomplete: boolean
): Promise<Result<SubmitExamSubjectResult, ApiError>> {
  const { data, error } = await client.rpc("submit_exam_subject", {
    p_workspace_id: ctx.workspaceId,
    p_exam_subject_id: paperId,
    p_confirm_incomplete: confirmIncomplete,
  })
  if (error) return err(fromDbError(error))
  const row = data as unknown as SubmitJson
  return ok({
    submitted: row.submitted,
    missing: row.missing.map((m) => ({
      studentId: m.student_id,
      fullName: m.full_name,
      fullNameBn: m.full_name_bn,
      rollNumber: m.roll_number,
    })),
  })
}

/** §7 `lockExamSubject` (owner/admin, D-307): submitted -> locked. */
export async function lockExamSubject(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  paperId: string
): Promise<Result<void, ApiError>> {
  const { error } = await client.rpc("lock_exam_subject", {
    p_workspace_id: ctx.workspaceId,
    p_exam_subject_id: paperId,
  })
  if (error) return err(fromDbError(error))
  return ok(undefined)
}

/**
 * §7 `unlockExamSubject` (owner/admin, D-307): locked -> submitted with a
 * reason; on a marks_locked exam the exam returns to marks entry and its
 * results are cleared.
 */
export async function unlockExamSubject(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  paperId: string,
  reason: string
): Promise<Result<void, ApiError>> {
  const { error } = await client.rpc("unlock_exam_subject", {
    p_workspace_id: ctx.workspaceId,
    p_exam_subject_id: paperId,
    p_reason: reason,
  })
  if (error) return err(fromDbError(error))
  return ok(undefined)
}
