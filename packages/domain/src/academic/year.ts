import { compareDates, daysBetween, type IsoDate } from "../time"

/**
 * F-ID-05 §4.3 Step 2 ("Where and when") and §5 "Business rules and
 * calculations" — the academic-year date range and the Sat-first
 * working-week derivation. Pure and synchronous: the wizard calls these to
 * decide whether "Continue" is enabled and to explain why when it is not
 * (§6: "invalid date range blocks Continue with a reason"). The Zod schema
 * in `packages/contracts/src/identity/school.ts` only checks shape (two
 * real `YYYY-MM-DD` strings) — the day-count/ordering business rule lives
 * here, one layer up, per the domain/contracts split `../settings.ts`
 * documents for `school_profiles`' other fields.
 */

/** §5: "must be 1-730 days and ends_on > starts_on." */
export const ACADEMIC_YEAR_MAX_DAYS = 730

export type AcademicYearRangeIssue = "ends_before_starts" | "too_long"

export type AcademicYearRangeResult =
  { ok: true } | { ok: false; issue: AcademicYearRangeIssue }

export function validateAcademicYearRange(range: {
  starts_on: IsoDate
  ends_on: IsoDate
}): AcademicYearRangeResult {
  // `ends_on` must be strictly after `starts_on`: this also guarantees the
  // "at least 1 day" half of the 1-730 rule, since two distinct calendar
  // dates are always >= 1 day apart — there is no shorter, valid range this
  // branch would let through.
  if (compareDates(range.ends_on, range.starts_on) <= 0) {
    return { ok: false, issue: "ends_before_starts" }
  }
  if (daysBetween(range.starts_on, range.ends_on) > ACADEMIC_YEAR_MAX_DAYS) {
    return { ok: false, issue: "too_long" }
  }
  return { ok: true }
}

/** Sat-first ISO day-number order (1=Mon..7=Sun): Sat, Sun, Mon, Tue, Wed,
 * Thu, Fri (PRODUCT-DECISIONS §2.5). */
export const SAT_FIRST_ORDER = [6, 7, 1, 2, 3, 4, 5] as const

/** §5 `first_day_of_week`: "derived as the first selected day in Sat-first
 * order." `null` only for the degenerate empty-selection input the UI never
 * actually allows (working-day pickers require at least one day). */
export function deriveFirstDayOfWeek(workingDays: number[]): number | null {
  for (const day of SAT_FIRST_ORDER) {
    if (workingDays.includes(day)) return day
  }
  return null
}

/** DATA-MODEL.md §1.3 / PRODUCT-DECISIONS §2.5: Sat-Thu, ISO day numbers. */
export const DEFAULT_WORKING_DAYS = [6, 7, 1, 2, 3, 4] as const
