/**
 * The owner/admin "today" dashboard (D-400) — the pure parts: which setup steps
 * are still missing, and how long a trial has left. Every input is a real
 * count or column read by `getDashboardSummary` (packages/db); nothing here
 * invents a number.
 */

import { catalogEntry } from "../audit"
import { daysBetween, todayIn, type IsoDate } from "../time"

export type SetupFacts = {
  /** The school has a letterhead line or a logo (F-OP-07 branding). */
  hasSchoolProfile: boolean
  teacherCount: number
  staffRecordCount: number
  /** Academic years marked `is_current` (the create-school wizard makes one). */
  currentAcademicYearCount: number
  /** `grade_levels` rows — the wizard's classes step. */
  gradeLevelCount: number
  /** No student table exists yet — 0 until F-AC-02 ships. */
  studentCount: number
}

export type SetupStepKey =
  "school_profile" | "academic_year" | "teachers" | "staff_records" | "students"

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
      href: "/app/settings/branding",
    },
    {
      key: "academic_year",
      // One step, as the wizard does both on one screen: a current year and
      // at least one class (grade level).
      done: facts.currentAcademicYearCount > 0 && facts.gradeLevelCount > 0,
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

/**
 * Whether an audit action has a curated sentence. The generic `<table>.<op>`
 * rows name raw tables ("a profiles record"); the full trail at /app/audit
 * may show them, the dashboard's short feed does not.
 */
export function isCuratedAuditAction(action: string): boolean {
  const entry = catalogEntry(action)
  return entry !== undefined && !entry.isGeneric
}
