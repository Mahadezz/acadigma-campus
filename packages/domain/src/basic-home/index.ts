/**
 * F-ID-10 Part 2 (§4.4) — the pure parts of the basic-mode home: which
 * greeting period a clock time falls in, which sections still owe today's
 * roll call, and turning the two assignment sources (class teacher, subject
 * teacher — F-ID-10 §2 footnote ²) into one ordered list of class blocks.
 * Every input is a real value the repository already read; nothing here
 * queries anything.
 */

import type {
  AttendanceDaySection,
  BasicHomeAttendanceStatus,
  BasicHomeClass,
  BasicHomeTodo,
  GreetingPeriod,
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
  section: AttendanceDaySection
): BasicHomeAttendanceStatus {
  if (!isSchoolDay) return "not_school_day"
  return section.session ? "taken" : "not_taken"
}

/** One teaching assignment: either "I am the class teacher" (no subject) or
 * "I teach this subject in this section" (§2 footnote ²). */
export type Assignment =
  | { sectionId: string; subject: null; subjectBn: null }
  | { sectionId: string; subject: string; subjectBn: string | null }

/**
 * §4.4.2: one block per assignment, in the section's existing grade/name
 * order (`public.attendance_day` already sorts `sections` by
 * `grade_levels.level_number, sections.name` — preserved here, not
 * re-derived, because this Part has no `level_number` to sort by on its
 * own). A section the caller is not actually assigned to (a stale id) is
 * silently dropped rather than thrown — the repository is the source of
 * truth for who is assigned, not this function.
 */
export function buildClassBlocks(
  isSchoolDay: boolean,
  assignments: readonly Assignment[],
  orderedSections: readonly AttendanceDaySection[]
): BasicHomeClass[] {
  const bySection = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const list = bySection.get(a.sectionId) ?? []
    list.push(a)
    bySection.set(a.sectionId, list)
  }

  const blocks: BasicHomeClass[] = []
  for (const section of orderedSections) {
    const mine = bySection.get(section.sectionId)
    if (!mine) continue
    const status = attendanceStatus(isSchoolDay, section)
    for (const a of mine) {
      blocks.push({
        sectionId: section.sectionId,
        gradeName: section.gradeName,
        gradeNameBn: section.gradeNameBn,
        sectionName: section.sectionName,
        subject: a.subject,
        subjectBn: a.subjectBn,
        studentCount: section.enrolled,
        attendanceToday: status,
        ...(status === "taken" && section.session
          ? { taken: section.session.expected, expected: section.enrolled }
          : {}),
      })
    }
  }
  return blocks
}

export type { AttendanceDaySection }
