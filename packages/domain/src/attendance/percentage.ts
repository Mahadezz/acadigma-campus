import type { AttendanceStatus, SessionCounts } from "@acadigma/contracts"

/**
 * F-AC-03 §5.4 — the ONE attendance percentage, mirrored by
 * `app.attendance_pct` (20260925300309_attendance.sql). Both test suites use
 * the same fixture (AC5: 18 present, 1 late, 1 half day, 2 absent = 90.91).
 * Present counts 1; late and half day count 1 unless the school's policy
 * says otherwise; excused and absent count 0; every record is in the
 * denominator.
 */
export type AttendanceWeightsPolicy = {
  late_counts_present: boolean
  half_day_counts_present: boolean
}

export function attendanceWeight(
  status: AttendanceStatus,
  policy: AttendanceWeightsPolicy
): number {
  switch (status) {
    case "present":
      return 1
    case "late":
      return policy.late_counts_present ? 1 : 0
    case "half_day":
      return policy.half_day_counts_present ? 1 : 0
    default:
      return 0
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** A student's percentage over a set of records; 0 with no records. */
export function attendancePercentage(
  statuses: readonly AttendanceStatus[],
  policy: AttendanceWeightsPolicy
): number {
  if (statuses.length === 0) return 0
  const present = statuses.reduce(
    (sum, status) => sum + attendanceWeight(status, policy),
    0
  )
  return round2((100 * present) / statuses.length)
}

/**
 * §5.5: a section's rate for one day from its session counts. `null` when
 * there is no session — an untaken day or a holiday is a gap, never 0 %.
 */
export function sectionDayRate(
  counts: SessionCounts | null,
  policy: AttendanceWeightsPolicy
): number | null {
  if (!counts || counts.expected === 0) return null
  const present =
    counts.present +
    (policy.late_counts_present ? counts.late : 0) +
    (policy.half_day_counts_present ? counts.halfDay : 0)
  return round2((100 * present) / counts.expected)
}

/** The school's rate so far today: every marked section's weighted present
 * over their expected students. `null` until one section is marked. */
export function schoolDayRate(
  sessions: readonly SessionCounts[],
  policy: AttendanceWeightsPolicy
): number | null {
  const expected = sessions.reduce((sum, s) => sum + s.expected, 0)
  if (expected === 0) return null
  const present = sessions.reduce(
    (sum, s) =>
      sum +
      s.present +
      (policy.late_counts_present ? s.late : 0) +
      (policy.half_day_counts_present ? s.halfDay : 0),
    0
  )
  return round2((100 * present) / expected)
}

/** §5.9: may a teacher still change `date`? Both are school-local ISO dates. */
export function editWindowOpen(
  date: string,
  today: string,
  windowDays: number
): boolean {
  const days =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
    86_400_000
  return days >= 0 && days <= windowDays
}
