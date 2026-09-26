/**
 * F-OP-03 Part 6 (D-208) — the monthly attendance register (spec §4 "Sign and
 * lock" workflow deferred, §5.2/§5.7). One RPC call per (section, month):
 * `public.attendance_register` (20260926034526_report_register_marksheet_kinds.sql,
 * review fix) returns the section, the roster, the calendar days
 * (`app.is_school_day` already computed per day) and every attendance record
 * as ONE jsonb value — PostgREST's `max_rows` (supabase/config.toml) caps the
 * number of ROWS in a resultset, never a function's single scalar return, so
 * this is immune to it by construction. The previous version selected
 * `attendance_records` directly through PostgREST and silently dropped rows
 * past 1,000 (a 40-student x 26-day month is already 1,040 records), with
 * wrong "-" cells and % and no error anywhere — see that migration's comment.
 *
 * A cell is a status only when: the day is a school day, AND the student was
 * enrolled in this section that day, AND a session was taken that day (in
 * which case `public.save_attendance` guarantees a record for every enrolled
 * student, §5.3) — every other case is `null` ("-" on the page), decided
 * from the roster's own enrolment window and the day's `isSchoolDay`/
 * `sessionTaken`, never guessed by the template.
 */
import { z } from "zod"

import {
  apiError,
  attendanceStatusSchema,
  err,
  ok,
  type ApiError,
  type AttendanceRegisterDto,
  type AttendanceStatus,
  type Result,
} from "@acadigma/contracts"
import { attendanceWeight } from "@acadigma/domain/attendance"
import { roundHalfUp } from "@acadigma/domain/grading"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

const rpcResultSchema = z.object({
  section: z
    .object({ id: z.string(), name: z.string(), grade_name: z.string() })
    .nullable(),
  policy: z
    .object({
      late_counts_present: z.boolean(),
      half_day_counts_present: z.boolean(),
    })
    .optional(),
  days: z
    .array(
      z.object({
        date: z.string(),
        is_school_day: z.boolean().nullable(),
        session_taken: z.boolean(),
      })
    )
    .optional()
    .default([]),
  roster: z
    .array(
      z.object({
        student_id: z.string(),
        roll_number: z.number().int().nullable(),
        full_name: z.string(),
        full_name_bn: z.string().nullable(),
        enrolled_on: z.string(),
        ended_on: z.string().nullable(),
      })
    )
    .optional()
    .default([]),
  records: z
    .array(
      z.object({
        student_id: z.string(),
        date: z.string(),
        status: attendanceStatusSchema,
      })
    )
    .optional()
    .default([]),
})

/**
 * The register's data for one section and one `YYYY-MM` month, through
 * `public.attendance_register` — SECURITY INVOKER, so the CALLER's own RLS
 * decides what it returns (F-AC-03 §5, D-104/D-105: not yet narrowed to "own
 * sections", so this matches the table's own current row-scoping rather
 * than inventing a stricter one here).
 */
export async function getAttendanceRegister(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string,
  month: string
): Promise<Result<AttendanceRegisterDto, ApiError>> {
  const match = MONTH_RE.exec(month)
  if (!match) {
    return err(apiError("validation_failed", "That month is not valid."))
  }
  const year = Number(match[1])
  const monthNum = Number(match[2])

  const { data, error } = await supabase.rpc("attendance_register", {
    p_workspace_id: ctx.workspaceId,
    p_section_id: sectionId,
    p_month: `${match[1]}-${match[2]}-01`,
  })
  if (error) return err(UNAVAILABLE)

  const parsed = rpcResultSchema.safeParse(data)
  if (!parsed.success) return err(UNAVAILABLE)
  if (!parsed.data.section) {
    return err(apiError("not_found", "That class was not found."))
  }
  const { section, policy, days, roster, records } = parsed.data
  const lateCountsPresent = policy?.late_counts_present ?? true
  const halfDayCountsPresent = policy?.half_day_counts_present ?? true

  const recordMap = new Map<string, AttendanceStatus>()
  for (const rec of records) {
    recordMap.set(`${rec.student_id}|${rec.date}`, rec.status)
  }

  const students = roster.map((row) => {
    const cells: (AttendanceStatus | null)[] = days.map((day) => {
      if (!day.is_school_day) return null
      if (
        day.date < row.enrolled_on ||
        (row.ended_on !== null && day.date > row.ended_on)
      ) {
        return null
      }
      return recordMap.get(`${row.student_id}|${day.date}`) ?? null
    })
    const recorded = cells.filter((c): c is AttendanceStatus => c !== null)
    const presentEquivalent = recorded.reduce(
      (sum, status) =>
        sum +
        attendanceWeight(status, {
          late_counts_present: lateCountsPresent,
          half_day_counts_present: halfDayCountsPresent,
        }),
      0
    )
    const percent =
      recorded.length === 0
        ? null
        : roundHalfUp((100 * presentEquivalent) / recorded.length, 0)
    return {
      studentId: row.student_id,
      rollNumber: row.roll_number,
      studentNameEn: row.full_name,
      studentNameBn: row.full_name_bn ?? row.full_name,
      cells,
      presentEquivalent,
      recordedDays: recorded.length,
      percent,
    }
  })
  students.sort(
    (a, b) =>
      (a.rollNumber ?? Number.MAX_SAFE_INTEGER) -
      (b.rollNumber ?? Number.MAX_SAFE_INTEGER)
  )

  const daysShaped = days.map((day, i) => ({
    date: day.date,
    dayOfMonth: i + 1,
    isSchoolDay: day.is_school_day ?? false,
    sessionTaken: day.session_taken,
    presentCount: day.session_taken
      ? students.filter((st) => st.cells[i] === "present").length
      : 0,
  }))

  const incompleteDaysCount = daysShaped.filter(
    (d) => d.isSchoolDay && !d.sessionTaken
  ).length
  const totalSchoolDays = daysShaped.filter((d) => d.isSchoolDay).length

  return ok({
    className: section.grade_name,
    sectionName: section.name,
    year,
    month: monthNum,
    days: daysShaped,
    students,
    incompleteDaysCount,
    totalSchoolDays,
    policy: {
      lateCountsPresent,
      halfDayCountsPresent,
    },
  })
}
