import { compareDates, type IsoDate } from "../time"

/**
 * F-OP-07 Part 2 (D-210) — terms within an academic year, and exam
 * weighting's 100 % rule (§4 W3.2, W3.3).
 *
 * Scope note (D-210): terms are added one at a time, the same way holidays
 * are (F-AC-11 Part 1) — a school building its calendar mid-way through the
 * year cannot be forced to cover every remaining day before the first term
 * is saved. So this checks the two things that are wrong regardless of how
 * much of the year is filled in yet (a term outside the year, two terms
 * overlapping); it does not block an incomplete year the way the grade-scale
 * editor blocks an incomplete 0-100 scale (§5.2), because unlike a scale, an
 * incomplete set of terms is a normal, temporary state and no other table
 * reads term_id yet (D-303: exams do not).
 */

export type TermRangeIssue = "TERM_OUTSIDE_YEAR" | "TERM_OVERLAP" | "TERM_ENDS_BEFORE_STARTS"

/**
 * Validates one term (new or edited) against its academic year's range and
 * every *other* term already in that year. `existing` should exclude the
 * term being edited (or pass its `id` to have it excluded here).
 */
export function checkTermRange(
  year: { starts_on: IsoDate; ends_on: IsoDate },
  candidate: { id?: string; starts_on: IsoDate; ends_on: IsoDate },
  existing: readonly { id?: string; starts_on: IsoDate; ends_on: IsoDate }[]
): TermRangeIssue | null {
  if (compareDates(candidate.starts_on, candidate.ends_on) > 0) {
    return "TERM_ENDS_BEFORE_STARTS"
  }
  if (
    compareDates(candidate.starts_on, year.starts_on) < 0 ||
    compareDates(candidate.ends_on, year.ends_on) > 0
  ) {
    return "TERM_OUTSIDE_YEAR"
  }
  for (const other of existing) {
    if (
      candidate.id !== undefined &&
      other.id !== undefined &&
      other.id === candidate.id
    ) {
      continue
    }
    const overlaps =
      compareDates(candidate.starts_on, other.ends_on) <= 0 &&
      compareDates(candidate.ends_on, other.starts_on) >= 0
    if (overlaps) return "TERM_OVERLAP"
  }
  return null
}

/** §4 W3.3: "a live sum; saving is blocked unless the sum is 100 (or
 * weighting is off)". An empty map is weighting-off — always valid. */
export function examWeightSum(weights: Record<string, number>): number {
  return Object.values(weights).reduce((sum, w) => sum + w, 0)
}

export function checkExamWeights(
  weights: Record<string, number>
): "WEIGHTS_NOT_100" | null {
  if (Object.keys(weights).length === 0) return null
  // Float tolerance: weights travel as percentages a form can enter in
  // fractions (e.g. 33.33 x 3).
  return Math.abs(examWeightSum(weights) - 100) < 0.01 ? null : "WEIGHTS_NOT_100"
}
