import { z } from "zod"

import { attendanceStatusSchema } from "../academics/attendance"
import { uuidSchema } from "../common"

/**
 * F-OP-03 Part 6 (D-208) — the monthly attendance register's render DTO and
 * the params `createReportRun` accepts for `kind: 'attendance_register'`.
 *
 * Columns are every CALENDAR day of the month (spec: "students x school
 * days of the month, non-school days ... greyed") — `isSchoolDay` on each
 * `AttendanceRegisterDay` tells the template which columns to grey, rather
 * than the DTO only carrying school days and the template inferring gaps.
 * A cell is `null` when the day is not a school day, the student was not
 * enrolled in the section that day, or no session was taken yet — the
 * template never guesses which of those three it is from the cell alone
 * (§5.7 rule 8: empty cells print "-", never "0", never blank without a
 * reason a human can check against the legend/banner).
 *
 * No grading or percentage-formula code lives outside `packages/domain`'s
 * `attendanceWeight` (F-AC-03 §5.4, D-104's policy booleans) — this DTO
 * carries only already-computed per-student totals/percentages, the same
 * "one attendance truth" rule the report card already follows.
 */

export const attendanceRegisterParamsSchema = z.object({
  kind: z.literal("attendance_register"),
  sectionId: uuidSchema,
  /** `YYYY-MM`, the month the register covers. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM"),
})
export type AttendanceRegisterParams = z.infer<
  typeof attendanceRegisterParamsSchema
>

export const attendanceRegisterDaySchema = z.object({
  date: z.string(),
  dayOfMonth: z.number().int().min(1).max(31),
  isSchoolDay: z.boolean(),
  /** A session for this section exists on this school day. */
  sessionTaken: z.boolean(),
  /** Raw count of students marked `present` this day (0 on a non-school day
   * or a day with no session taken) — a direct SQL `count(*)` cross-check. */
  presentCount: z.number().int().min(0),
})
export type AttendanceRegisterDay = z.infer<typeof attendanceRegisterDaySchema>

export const attendanceRegisterStudentRowSchema = z.object({
  studentId: uuidSchema,
  rollNumber: z.number().int().positive().nullable(),
  studentNameEn: z.string().min(1),
  studentNameBn: z.string().min(1),
  /** One cell per day in `AttendanceRegisterDto.days`, same order/length. */
  cells: z.array(attendanceStatusSchema.nullable()),
  /** Weighted present count over the days this student has a recorded status
   * (F-AC-03 §5.4's `attendanceWeight`). */
  presentEquivalent: z.number().min(0),
  /** Number of days this student has a recorded status (the percentage's
   * denominator) — not the same as `totalSchoolDays` when the student
   * enrolled mid-month or a day's session was never taken. */
  recordedDays: z.number().int().min(0),
  /** `null` with zero recorded days. */
  percent: z.number().min(0).max(100).nullable(),
})
export type AttendanceRegisterStudentRow = z.infer<
  typeof attendanceRegisterStudentRowSchema
>

export const attendanceRegisterDtoSchema = z.object({
  className: z.string().min(1),
  sectionName: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  days: z.array(attendanceRegisterDaySchema).min(1),
  students: z.array(attendanceRegisterStudentRowSchema),
  /** School days in the month with no session taken yet (spec: "incomplete:
   * n days not taken" banner). */
  incompleteDaysCount: z.number().int().min(0),
  totalSchoolDays: z.number().int().min(0),
  /** The school's own policy, printed in the legend (spec: "late/half-day
   * counts present?") — never re-derived by the template. */
  policy: z.object({
    lateCountsPresent: z.boolean(),
    halfDayCountsPresent: z.boolean(),
  }),
})
export type AttendanceRegisterDto = z.infer<typeof attendanceRegisterDtoSchema>
