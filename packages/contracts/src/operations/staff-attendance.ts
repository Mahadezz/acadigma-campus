import { z } from "zod"

/**
 * F-AC-04 Part 1 (D-214): staff self check-in. Mirrors
 * `public.staff_attendance_status` (20260930215958_staff_attendance.sql).
 * Self-service writes only `present` and `late`; the rest are written by
 * later Parts (admin grid, leave) or derived at report time.
 */
export const staffAttendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "half_day",
  "on_leave",
  "holiday",
  "weekend",
  "official_duty",
])
export type StaffAttendanceStatus = z.infer<typeof staffAttendanceStatusSchema>

/** One day's row as `public.staff_check_in` / `staff_check_out` return it. */
export type StaffAttendanceRecord = {
  id: string
  date: string
  status: StaffAttendanceStatus
  checkInAt: string | null
  checkOutAt: string | null
  minutesLate: number | null
}

/** What the check-in card needs: the school's today, whether it is a school day, my row. */
export type StaffCheckInToday = {
  today: string
  /** IANA zone the school's clock runs in, for formatting the recorded times. */
  timezone: string
  isSchoolDay: boolean
  record: StaffAttendanceRecord | null
}
