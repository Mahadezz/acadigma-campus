import type { AttendanceStatus } from "@acadigma/contracts"

import {
  attendancePercentage,
  type AttendanceWeightsPolicy,
} from "./percentage"

/**
 * F-OP-07 §4 W4 — the settings screen's live effect line: given one real
 * student's recorded statuses (unchanged by a policy edit, §5.8 rule 2) and a
 * *candidate* policy the form has not saved yet, what their percentage would
 * be and whether they would clear the exam-eligibility warning line.
 * `min_attendance_bp` is basis points (7500 = 75 %), matching
 * `school_profiles.attendance_policy` (packages/domain/settings/defaults.ts).
 */
export type AttendancePolicyEffect = {
  percent: number
  eligible: boolean
}

export function previewAttendanceEffect(
  statuses: readonly AttendanceStatus[],
  policy: AttendanceWeightsPolicy,
  minAttendanceBp: number
): AttendancePolicyEffect {
  const percent = attendancePercentage(statuses, policy)
  return { percent, eligible: percent >= minAttendanceBp / 100 }
}
