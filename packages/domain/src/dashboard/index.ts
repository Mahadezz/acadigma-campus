/**
 * The owner/admin "today" dashboard (D-400) — the pure parts: which setup steps
 * are still missing, and how long a trial has left. Every input is a real
 * count or column read by `getDashboardSummary` (packages/db); nothing here
 * invents a number.
 */

import { daysBetween, todayIn, type IsoDate } from "../time"

export type SetupFacts = {
  /** The school has a letterhead line or a logo (F-OP-07 branding). */
  hasSchoolProfile: boolean
  teacherCount: number
  staffRecordCount: number
  /** No academic-year or student table exists yet — false until those Parts ship. */
  hasAcademicYear: boolean
  studentCount: number
}

export type SetupStepKey =
  | "school_profile"
  | "academic_year"
  | "teachers"
  | "staff_records"
  | "students"

export type SetupStep = { key: SetupStepKey; done: boolean; href: string }

/**
 * Setup order a school actually follows. `href` is the same route the school
 * nav (DESIGN-SYSTEM §3.2) already links to for that job, so the checklist and
 * the nav never disagree about where a task lives.
 */
export function buildSetupChecklist(facts: SetupFacts): SetupStep[] {
  return [
    {
      key: "school_profile",
      done: facts.hasSchoolProfile,
      href: "/app/settings",
    },
    {
      key: "academic_year",
      done: facts.hasAcademicYear,
      href: "/app/classes",
    },
    { key: "teachers", done: facts.teacherCount > 0, href: "/app/staff" },
    {
      key: "staff_records",
      done: facts.staffRecordCount > 0,
      href: "/app/staff",
    },
    { key: "students", done: facts.studentCount > 0, href: "/app/students" },
  ]
}

/**
 * Whole days left in a trial, counted on the workspace's calendar: 0 on the
 * last day, negative once it has passed, null when there is no trial.
 */
export function trialDaysLeft(
  trialEndsAt: string | null,
  timeZone: string,
  now: Date = new Date()
): number | null {
  if (!trialEndsAt) return null
  const end: IsoDate = todayIn(timeZone, new Date(trialEndsAt))
  return daysBetween(todayIn(timeZone, now), end)
}
