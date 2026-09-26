/**
 * F-ID-10 Part 2 (§4.4) — the pure parts of the basic-mode home: which
 * greeting period a clock time falls in, which sections still owe today's
 * roll call, and turning F-AC-01's `listMySections` (D-107) into one
 * ordered list of class blocks with today's attendance mark. Every input is
 * a real value the repository already read; nothing here queries anything.
 */

import type {
  AttendanceDaySection,
  BasicHomeAttendanceStatus,
  BasicHomeClass,
  BasicHomeTodo,
  GreetingPeriod,
  MySection,
} from "@acadigma/contracts"

/** Bangladeshi school day boundaries: before 12:00 is morning, before 17:00
 * is afternoon, else evening. `hour` is 0-23 local (workspace-timezone) time,
 * from `clockTimeIn` (`packages/domain/src/time.ts`). */
export function greetingPeriod(hour: number): GreetingPeriod {
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}

/** §4.1: "2 roll calls not taken" — the teacher's own sections (by id) with
 * no session today, only on a school day (a non-school day has nothing to
 * take, so it is never a to-do). Empty on a non-school day or when every
 * assigned section is already taken. */
export function buildTodos(
  isSchoolDay: boolean,
  mySectionIds: readonly string[],
  sectionsById: ReadonlyMap<string, AttendanceDaySection>
): BasicHomeTodo[] {
  if (!isSchoolDay) return []
  const notTaken = new Set(
    mySectionIds.filter((id) => sectionsById.get(id)?.session == null)
  )
  return notTaken.size > 0
    ? [{ kind: "roll_calls_not_taken", count: notTaken.size }]
    : []
}

function attendanceStatus(
  isSchoolDay: boolean,
  section: AttendanceDaySection | undefined
): BasicHomeAttendanceStatus {
  if (!isSchoolDay) return "not_school_day"
  return section?.session ? "taken" : "not_taken"
}

/**
 * §4.4.2: one `ClassBlock` per `MySection` (D-107's `listMySections` already
 * groups "class teacher" and "every subject taught there" into one entry
 * per section, in grade/name order — preserved here, not re-derived).
 * `attendance_day`'s per-section enrolled count and session are merged in
 * by `sectionId`; a section `listMySections` returned that `attendance_day`
 * does not know about (should not happen — both read the current year's
 * live sections) falls back to a zero student count and `not_taken` rather
 * than throwing.
 */
export function buildClassBlocks(
  isSchoolDay: boolean,
  mySections: readonly MySection[],
  attendanceSections: readonly AttendanceDaySection[]
): BasicHomeClass[] {
  const attendanceBySection = new Map(
    attendanceSections.map((s) => [s.sectionId, s])
  )

  return mySections.map((mine) => {
    const attendance = attendanceBySection.get(mine.sectionId)
    const status = attendanceStatus(isSchoolDay, attendance)
    return {
      sectionId: mine.sectionId,
      gradeName: mine.gradeName,
      gradeNameBn: mine.gradeNameBn,
      sectionName: mine.sectionName,
      isClassTeacher: mine.isClassTeacher,
      subjects: mine.subjects,
      studentCount: attendance?.enrolled ?? 0,
      attendanceToday: status,
      ...(status === "taken" && attendance?.session
        ? { taken: attendance.session.expected, expected: attendance.enrolled }
        : {}),
    }
  })
}

export type { AttendanceDaySection }
