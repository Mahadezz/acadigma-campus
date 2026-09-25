/**
 * F-AC-03 demo cut (D-104) — the Today overview, one section's roll call
 * and the save. Every function takes `WorkspaceContext` first and passes
 * `ctx.workspaceId`; RLS and `public.save_attendance` re-check everything.
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type AttendanceDay,
  type AttendanceStatus,
  type Result,
  type RollCallStudent,
  type SaveAttendanceInput,
  type SaveAttendanceResult,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

type DayJson = {
  date: string
  today: string
  is_school_day: boolean
  edit_window_days: number
  sections: {
    section_id: string
    section_name: string
    grade_name: string
    grade_name_bn: string | null
    class_teacher_name: string | null
    is_mine: boolean
    enrolled: number
    session: {
      id: string
      updated_at: string
      taken_at: string
      taken_by_name: string | null
      expected: number
      present: number
      absent: number
      late: number
      excused: number
      half_day: number
      bulk_marked: boolean
    } | null
  }[]
}

/** §6 Today: every live section of the current year and its session for
 * `date` (the school's today when omitted). */
export async function getAttendanceDay(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  date?: string
): Promise<Result<AttendanceDay, ApiError>> {
  const { data, error } = await supabase.rpc("attendance_day", {
    p_workspace_id: ctx.workspaceId,
    ...(date ? { p_date: date } : {}),
  })
  if (error || !data) return err(UNAVAILABLE)
  const day = data as unknown as DayJson
  return ok({
    date: day.date,
    today: day.today,
    isSchoolDay: day.is_school_day,
    editWindowDays: day.edit_window_days,
    sections: day.sections.map((s) => ({
      sectionId: s.section_id,
      sectionName: s.section_name,
      gradeName: s.grade_name,
      gradeNameBn: s.grade_name_bn,
      classTeacherName: s.class_teacher_name,
      isMine: s.is_mine,
      enrolled: s.enrolled,
      session: s.session
        ? {
            id: s.session.id,
            updatedAt: s.session.updated_at,
            takenAt: s.session.taken_at,
            takenByName: s.session.taken_by_name,
            bulkMarked: s.session.bulk_marked,
            expected: s.session.expected,
            present: s.session.present,
            absent: s.session.absent,
            late: s.session.late,
            excused: s.session.excused,
            halfDay: s.session.half_day,
          }
        : null,
    })),
  })
}

type EnrollmentRow = {
  roll_number: number | null
  students: { id: string; full_name: string; full_name_bn: string | null }
}

/**
 * §5.3: the students enrolled in the section on `date`, by roll number,
 * each with the status already saved for that date (or null).
 */
export async function getRollCall(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string,
  date: string,
  sessionId: string | null
): Promise<Result<RollCallStudent[], ApiError>> {
  const [enrollments, records] = await Promise.all([
    supabase
      .from("enrollments")
      .select("roll_number, students!inner(id, full_name, full_name_bn)")
      .eq("workspace_id", ctx.workspaceId)
      .eq("section_id", sectionId)
      .lte("enrolled_on", date)
      .or(`ended_on.is.null,ended_on.gte.${date}`)
      .eq("students.status", "active")
      .is("students.deleted_at", null)
      .order("roll_number", { ascending: true, nullsFirst: false }),
    sessionId
      ? supabase
          .from("attendance_records")
          .select("student_id, status")
          .eq("workspace_id", ctx.workspaceId)
          .eq("session_id", sessionId)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (enrollments.error || records.error) return err(UNAVAILABLE)
  const saved = new Map<string, AttendanceStatus>(
    (records.data ?? []).map((r) => [r.student_id, r.status])
  )
  return ok(
    ((enrollments.data ?? []) as unknown as EnrollmentRow[]).map((e) => ({
      studentId: e.students.id,
      rollNumber: e.roll_number,
      fullName: e.students.full_name,
      fullNameBn: e.students.full_name_bn,
      status: saved.get(e.students.id) ?? null,
    }))
  )
}

const SAVE_ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError("forbidden", "You cannot take attendance here.", {
    fieldErrors: { _root: ["FORBIDDEN"] },
  }),
  OUTSIDE_EDIT_WINDOW: apiError(
    "forbidden",
    "This day is past the correction window. Ask an admin.",
    { fieldErrors: { _root: ["OUTSIDE_EDIT_WINDOW"] } }
  ),
  NOT_SCHOOL_DAY: apiError("validation_failed", "This is not a school day.", {
    fieldErrors: { _root: ["NOT_SCHOOL_DAY"] },
  }),
  UNMARKED_STUDENTS: apiError(
    "validation_failed",
    "Mark every student before saving.",
    { fieldErrors: { _root: ["UNMARKED_STUDENTS"] } }
  ),
  STUDENT_NOT_ENROLLED: apiError(
    "conflict",
    "The class list changed. Reload and try again.",
    { fieldErrors: { _root: ["ROSTER_CHANGED"] } }
  ),
  NO_STUDENTS: apiError("validation_failed", "No students are enrolled.", {
    fieldErrors: { _root: ["NO_STUDENTS"] },
  }),
  CONFLICT: apiError(
    "conflict",
    "Someone else saved this class meanwhile. Reload to see it.",
    { fieldErrors: { _root: ["CONFLICT"] } }
  ),
  SESSION_LOCKED: apiError("forbidden", "This day is locked.", {
    fieldErrors: { _root: ["SESSION_LOCKED"] },
  }),
  FUTURE_DATE: apiError("validation_failed", "That day has not come yet.", {
    fieldErrors: { _root: ["FUTURE_DATE"] },
  }),
  OUTSIDE_YEAR: apiError(
    "validation_failed",
    "That day is outside the academic year.",
    { fieldErrors: { _root: ["OUTSIDE_YEAR"] } }
  ),
  SECTION_NOT_FOUND: apiError("not_found", "That class was not found."),
  SECTION_ARCHIVED: apiError("validation_failed", "That class is archived."),
  YEAR_CLOSED: apiError(
    "validation_failed",
    "That class is not in the current academic year."
  ),
  IDEMPOTENCY_KEY_REUSED: apiError(
    "conflict",
    "This form was already submitted with different marks. Please reload.",
    { fieldErrors: { _root: ["ROSTER_CHANGED"] } }
  ),
  VALIDATION: apiError("validation_failed", "Some of the marks are not valid."),
}

type SaveJson = {
  session_id: string
  updated_at: string
  expected: number
  present: number
  absent: number
  late: number
  excused: number
  half_day: number
}

/** §4.1: `public.save_attendance` writes the session and every record. */
export async function saveAttendance(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: SaveAttendanceInput
): Promise<Result<SaveAttendanceResult, ApiError>> {
  const { data, error } = await supabase.rpc("save_attendance", {
    p_workspace_id: ctx.workspaceId,
    p_input: {
      idempotency_key: input.idempotencyKey,
      section_id: input.sectionId,
      date: input.date,
      records: input.records.map((r) => ({
        student_id: r.studentId,
        status: r.status,
      })),
      bulk_marked: input.bulkMarked,
      allow_non_school_day: input.allowNonSchoolDay,
      expected_updated_at: input.expectedUpdatedAt,
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
    sessionId: row.session_id,
    updatedAt: row.updated_at,
    expected: row.expected,
    present: row.present,
    absent: row.absent,
    late: row.late,
    excused: row.excused,
    halfDay: row.half_day,
  })
}
