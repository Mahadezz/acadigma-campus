import { describe, expect, it } from "vitest"

import type { AttendanceStatus } from "@acadigma/contracts"

import { previewAttendanceEffect } from "./policy-preview"

// The same fixture as percentage.test.ts (AC5, supabase/tests/34_attendance.sql).
const MONTH: AttendanceStatus[] = [
  ...Array<AttendanceStatus>(18).fill("present"),
  "late",
  "half_day",
  "absent",
  "absent",
]

describe("previewAttendanceEffect (F-OP-07 §4 W4)", () => {
  it("computes the candidate policy's percent and the eligibility line", () => {
    const result = previewAttendanceEffect(
      MONTH,
      { late_counts_present: true, half_day_counts_present: true },
      7500
    )
    expect(result).toEqual({ percent: 90.91, eligible: true })
  })

  it("flips not-eligible when the candidate policy stops counting half days", () => {
    const result = previewAttendanceEffect(
      MONTH,
      { late_counts_present: true, half_day_counts_present: false },
      9000
    )
    // 19/22 = 86.36 < 90 % minimum
    expect(result).toEqual({ percent: 86.36, eligible: false })
  })

  it("no recorded statuses yet: 0 %, never eligible unless the minimum is 0", () => {
    expect(
      previewAttendanceEffect(
        [],
        { late_counts_present: true, half_day_counts_present: true },
        7500
      )
    ).toEqual({ percent: 0, eligible: false })
  })
})
