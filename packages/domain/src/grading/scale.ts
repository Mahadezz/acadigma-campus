import { roundHalfUp } from "./round"

/**
 * Grade scales — F-AC-06 §5.2. `bandFor` is the only letter/grade-point lookup
 * in TypeScript; `app.band_for(grade_scale_id, pct)` is the only one in SQL.
 * Both are pinned to the same cases in `supabase/tests/52_grade_scales.sql`.
 */
export type GradeBand = {
  letter: string
  minPercent: number
  maxPercent: number
  gradePoint: number
  isFail: boolean
  sortOrder: number
}

export const BD_GRADE_SCALE_CODE = "BD_GPA5"

/** PRODUCT-DECISIONS 2.4 — same rows as `public.seed_bd_grade_scale`. */
export const BD_GRADE_BANDS: readonly GradeBand[] = [
  { letter: "A+", minPercent: 80, maxPercent: 100, gradePoint: 5, isFail: false, sortOrder: 1 },
  { letter: "A", minPercent: 70, maxPercent: 79.99, gradePoint: 4, isFail: false, sortOrder: 2 },
  { letter: "A-", minPercent: 60, maxPercent: 69.99, gradePoint: 3.5, isFail: false, sortOrder: 3 },
  { letter: "B", minPercent: 50, maxPercent: 59.99, gradePoint: 3, isFail: false, sortOrder: 4 },
  { letter: "C", minPercent: 40, maxPercent: 49.99, gradePoint: 2, isFail: false, sortOrder: 5 },
  { letter: "D", minPercent: 33, maxPercent: 39.99, gradePoint: 1, isFail: false, sortOrder: 6 },
  { letter: "F", minPercent: 0, maxPercent: 32.99, gradePoint: 0, isFail: true, sortOrder: 7 },
]

/** The band holding `pct` once rounded to the bands' 2 decimals; null if none. */
export function bandFor(
  bands: readonly GradeBand[],
  pct: number
): GradeBand | null {
  const p = roundHalfUp(pct, 2)
  return bands.find((b) => p >= b.minPercent && p <= b.maxPercent) ?? null
}

export type CoverageIssue = {
  code: "BAND_GAP" | "BAND_OVERLAP"
  /** Hundredths of a percent where the problem starts, for highlighting. */
  at: number
}

/**
 * Same rule as `app.assert_grade_scale_coverage`: bands cover 0.00-100.00 with
 * no gap and no overlap, in 0.01 steps. Works in integer hundredths so
 * `79.99 + 0.01` is exactly `80`. Null when the set is valid (or empty).
 */
export function checkCoverage(
  bands: readonly Pick<GradeBand, "minPercent" | "maxPercent">[]
): CoverageIssue | null {
  const sorted = bands
    .map((b) => ({
      min: Math.round(b.minPercent * 100),
      max: Math.round(b.maxPercent * 100),
    }))
    .sort((a, b) => a.min - b.min || a.max - b.max)
  let prev: number | null = null
  for (const band of sorted) {
    if (band.min > band.max) return { code: "BAND_OVERLAP", at: band.min }
    if (prev === null) {
      if (band.min !== 0) return { code: "BAND_GAP", at: 0 }
    } else if (band.min <= prev) {
      return { code: "BAND_OVERLAP", at: band.min }
    } else if (band.min > prev + 1) {
      return { code: "BAND_GAP", at: prev + 1 }
    }
    prev = band.max
  }
  if (prev !== null && prev !== 10000) return { code: "BAND_GAP", at: prev + 1 }
  return null
}
