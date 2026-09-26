/**
 * F-OP-03 Part 6 (D-208) — the monthly attendance register (spec §4 "Sign and
 * lock" workflow deferred, §5.2/§5.7). One query set per (section, month):
 * the roster overlapping the month, every session taken and every record in
 * it, the school's calendar (working days + holidays + overrides, read
 * directly — no new `app.*` wrapper, see `@acadigma/domain/calendar`'s file
 * header) and the attendance policy booleans (F-AC-03 §5.4, same as
 * `getReportCard`).
 *
 * A cell is a status only when: the day is a school day, AND the student was
 * enrolled in this section that day, AND a session was taken that day (in
 * which case `public.save_attendance` guarantees a record for every enrolled
 * student, §5.3) — every other case is `null` ("-" on the page), and the
 * three cases are distinguishable from `AttendanceRegisterDay.isSchoolDay`/
 * `sessionTaken` plus the roster's own enrolment window, never guessed by
 * the template.
 */
import {
  apiError,
  err,
  ok,
  type ApiError,
  type AttendanceRegisterDto,
  type AttendanceStatus,
  type Result,
} from "@acadigma/contracts"
import { attendanceWeight } from "@acadigma/domain/attendance"
import {
  daysInMonth,
  isSchoolDay,
  type HolidayRange,
} from "@acadigma/domain/calendar"
import { roundHalfUp } from "@acadigma/domain/grading"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

type RosterRow = {
  roll_number: number | null
  students: {
    id: string
    full_name: string
    full_name_bn: string | null
    status: string
    deleted_at: string | null
  }
  enrolled_on: string
  ended_on: string | null
}

/**
 * The register's data for one section and one `YYYY-MM` month, through the
 * CALLER's own RLS client — the same read grant `attendance_sessions`/
 * `attendance_records` already give owner/admin/teacher/staff (F-AC-03
 * §5, D-104/D-105: not yet narrowed to "own sections", so this matches the
 * table's own current row-scoping rather than inventing a stricter one here).
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
  const dates = daysInMonth(year, monthNum)
  const monthStart = dates[0]!
  const monthEnd = dates[dates.length - 1]!

  const [section, roster, sessions, records, calendar, policyRow] =
    await Promise.all([
      supabase
        .from("sections")
        .select("id, name, grade_levels(name)")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", sectionId)
        .maybeSingle(),
      supabase
        .from("enrollments")
        .select(
          "roll_number, enrolled_on, ended_on, students!inner(id, full_name, full_name_bn, status, deleted_at)"
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("section_id", sectionId)
        .lte("enrolled_on", monthEnd)
        .or(`ended_on.is.null,ended_on.gte.${monthStart}`)
        .eq("students.status", "active")
        .is("students.deleted_at", null),
      supabase
        .from("attendance_sessions")
        .select("date")
        .eq("workspace_id", ctx.workspaceId)
        .eq("section_id", sectionId)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      supabase
        .from("attendance_records")
        .select(
          "student_id, status, attendance_sessions!inner(date, section_id)"
        )
        .eq("workspace_id", ctx.workspaceId)
        .eq("attendance_sessions.section_id", sectionId)
        .gte("attendance_sessions.date", monthStart)
        .lte("attendance_sessions.date", monthEnd),
      Promise.all([
        supabase
          .from("holidays")
          .select("starts_on, ends_on")
          .eq("workspace_id", ctx.workspaceId)
          .lte("starts_on", monthEnd)
          .gte("ends_on", monthStart),
        supabase
          .from("working_day_overrides")
          .select("date, is_working")
          .eq("workspace_id", ctx.workspaceId)
          .gte("date", monthStart)
          .lte("date", monthEnd),
      ]),
      supabase
        .from("school_profiles")
        .select("working_days, attendance_policy")
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle(),
    ])

  const [holidaysRes, overridesRes] = calendar
  if (
    section.error ||
    roster.error ||
    sessions.error ||
    records.error ||
    holidaysRes.error ||
    overridesRes.error ||
    policyRow.error
  ) {
    return err(UNAVAILABLE)
  }
  if (!section.data) {
    return err(apiError("not_found", "That class was not found."))
  }
  const s = section.data as unknown as {
    id: string
    name: string
    grade_levels: { name: string }
  }

  const workingDays = (policyRow.data?.working_days as number[] | null) ?? [
    6, 7, 1, 2, 3, 4,
  ]
  const policy = policyRow.data?.attendance_policy as
    | { late_counts_present?: boolean; half_day_counts_present?: boolean }
    | null
    | undefined
  const lateCountsPresent = policy?.late_counts_present ?? true
  const halfDayCountsPresent = policy?.half_day_counts_present ?? true

  const holidays: HolidayRange[] = (holidaysRes.data ?? []).map((h) => ({
    startsOn: h.starts_on,
    endsOn: h.ends_on,
  }))
  const overrides = new Map<string, boolean>(
    (overridesRes.data ?? []).map((o) => [o.date, o.is_working])
  )
  const sessionDates = new Set(
    (sessions.data ?? []).map((sess) => sess.date as string)
  )

  const days = dates.map((date, i) => ({
    date,
    dayOfMonth: i + 1,
    isSchoolDay: isSchoolDay(date, workingDays, holidays, overrides),
    sessionTaken: sessionDates.has(date),
  }))

  // student|date -> status, from attendance_records joined to their session.
  const recordMap = new Map<string, AttendanceStatus>()
  for (const rec of (records.data ?? []) as unknown as {
    student_id: string
    status: AttendanceStatus
    attendance_sessions: { date: string }
  }[]) {
    recordMap.set(
      `${rec.student_id}|${rec.attendance_sessions.date}`,
      rec.status
    )
  }

  const rosterRows = (roster.data ?? []) as unknown as RosterRow[]
  const students = rosterRows.map((row) => {
    const enrolledOn = row.enrolled_on
    const endedOn = row.ended_on
    const cells: (AttendanceStatus | null)[] = days.map((day) => {
      if (!day.isSchoolDay) return null
      if (day.date < enrolledOn || (endedOn !== null && day.date > endedOn)) {
        return null
      }
      return recordMap.get(`${row.students.id}|${day.date}`) ?? null
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
      studentId: row.students.id,
      rollNumber: row.roll_number,
      studentNameEn: row.students.full_name,
      studentNameBn: row.students.full_name_bn ?? row.students.full_name,
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

  const daysWithPresentCount = days.map((day) => ({
    ...day,
    presentCount: day.sessionTaken
      ? students.filter((st) => {
          const cell = st.cells[day.dayOfMonth - 1]
          return cell === "present"
        }).length
      : 0,
  }))

  const incompleteDaysCount = days.filter(
    (d) => d.isSchoolDay && !d.sessionTaken
  ).length
  const totalSchoolDays = days.filter((d) => d.isSchoolDay).length

  return ok({
    className: s.grade_levels.name,
    sectionName: s.name,
    year,
    month: monthNum,
    days: daysWithPresentCount,
    students,
    incompleteDaysCount,
    totalSchoolDays,
    policy: {
      lateCountsPresent,
      halfDayCountsPresent,
    },
  })
}
