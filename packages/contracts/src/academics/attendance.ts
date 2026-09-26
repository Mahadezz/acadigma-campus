import { z } from "zod"

import { isoDateTimeSchema, uuidSchema } from "../common"

/**
 * F-AC-03 demo cut (D-104) — the daily roll call. Enums mirror
 * 20260925300309_attendance.sql.
 */

export const attendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "excused",
  "half_day",
])
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

export const sessionCountsSchema = z.object({
  expected: z.number().int(),
  present: z.number().int(),
  absent: z.number().int(),
  late: z.number().int(),
  excused: z.number().int(),
  halfDay: z.number().int(),
})
export type SessionCounts = z.infer<typeof sessionCountsSchema>

/** One section on the Today screen (§6), from `public.attendance_day`. */
export type AttendanceDaySection = {
  sectionId: string
  sectionName: string
  gradeName: string
  gradeNameBn: string | null
  classTeacherName: string | null
  isMine: boolean
  enrolled: number
  session:
    | (SessionCounts & {
        id: string
        updatedAt: string
        takenAt: string
        takenByName: string | null
        bulkMarked: boolean
        /** F-ID-11 §5.3 (D-310): an offline roll call that reached the server late. */
        syncedLate: boolean
      })
    | null
}

export type AttendanceDay = {
  date: string
  today: string
  isSchoolDay: boolean
  editWindowDays: number
  sections: AttendanceDaySection[]
}

/** One student on the roll-call screen, with the saved status if any. */
export type RollCallStudent = {
  studentId: string
  rollNumber: number | null
  fullName: string
  fullNameBn: string | null
  status: AttendanceStatus | null
}

export const attendanceDateQuerySchema = z.object({
  date: isoDate.optional(),
})

/** §7 `saveAttendanceSession`. Every enrolled student is listed: nothing is
 * presumed present (D-22). `bulkMarked` says "Mark all present" was used. */
export const saveAttendanceInputSchema = z
  .object({
    idempotencyKey: uuidSchema,
    sectionId: uuidSchema,
    date: isoDate,
    records: z
      .array(
        z
          .object({ studentId: uuidSchema, status: attendanceStatusSchema })
          .strict()
      )
      .min(1)
      .max(200),
    bulkMarked: z.boolean().default(false),
    allowNonSchoolDay: z.boolean().default(false),
    /** The session version the screen loaded; null for a first save. */
    expectedUpdatedAt: z.string().max(40).nullable().default(null),
    /**
     * F-ID-11 Part 2a: set by an offline replay — the user and workspace that
     * queued the save. The action refuses it under any other session, so a
     * queued roll call is never sent as someone else or into another school.
     * Not passed to `save_attendance`.
     */
    /**
     * F-ID-11 Part 2b (D-310): when the roll was taken on the phone (device
     * clock corrected by the server offset), fixed when it is queued. Sent
     * only by a queued save; decides the late-sync bounds (§5.3) and marks
     * the audit row `queued_offline`.
     */
    capturedAt: isoDateTimeSchema.optional(),
    queuedFor: z
      .object({ userId: uuidSchema, workspaceId: uuidSchema })
      .strict()
      .optional(),
  })
  .strict()
export type SaveAttendanceInput = z.infer<typeof saveAttendanceInputSchema>

export type SaveAttendanceResult = SessionCounts & {
  sessionId: string
  updatedAt: string
}
