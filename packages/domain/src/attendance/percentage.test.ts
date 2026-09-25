import { describe, expect, it } from "vitest"

import {
  attendancePercentage,
  editWindowOpen,
  schoolDayRate,
  sectionDayRate,
} from "./percentage"

import type { AttendanceStatus } from "@acadigma/contracts"

const DEFAULT = { late_counts_present: true, half_day_counts_present: true }

// The same fixture as supabase/tests/34_attendance.sql (AC5).
const MONTH: AttendanceStatus[] = [
  ...Array<AttendanceStatus>(18).fill("present"),
  "late",
  "half_day",
  "absent",
  "absent",
]

describe("attendancePercentage (§5.4, mirrors app.attendance_pct)", () => {
  it("AC5: (18 + 1 + 1) / 22 = 90.91", () => {
    expect(attendancePercentage(MONTH, DEFAULT)).toBe(90.91)
  })

  it("half day not counting: 19 / 22 = 86.36", () => {
    expect(
      attendancePercentage(MONTH, {
        ...DEFAULT,
        half_day_counts_present: false,
      })
    ).toBe(86.36)
  })

  it("excused counts 0 but stays in the denominator", () => {
    expect(attendancePercentage(["present", "excused"], DEFAULT)).toBe(50)
  })

  it("no records is 0", () => {
    expect(attendancePercentage([], DEFAULT)).toBe(0)
  })
})

describe("sectionDayRate (§5.5)", () => {
  it("is null without a session: a gap, never 0 %", () => {
    expect(sectionDayRate(null, DEFAULT)).toBeNull()
  })

  it("counts late and half day by policy over the expected students", () => {
    const counts = {
      expected: 40,
      present: 35,
      absent: 3,
      late: 1,
      excused: 0,
      halfDay: 1,
    }
    expect(sectionDayRate(counts, DEFAULT)).toBe(92.5)
    expect(
      sectionDayRate(counts, { ...DEFAULT, late_counts_present: false })
    ).toBe(90)
  })
})

describe("schoolDayRate", () => {
  const c = (expected: number, present: number, late = 0) => ({
    expected,
    present,
    absent: expected - present - late,
    late,
    excused: 0,
    halfDay: 0,
  })

  it("weights every marked section by its students; null before any", () => {
    expect(schoolDayRate([], DEFAULT)).toBeNull()
    expect(schoolDayRate([c(40, 36), c(10, 9, 1)], DEFAULT)).toBe(92)
  })
})

describe("editWindowOpen (§5.9)", () => {
  it("allows today and up to N days back, never the future", () => {
    expect(editWindowOpen("2026-09-25", "2026-09-25", 2)).toBe(true)
    expect(editWindowOpen("2026-09-23", "2026-09-25", 2)).toBe(true)
    expect(editWindowOpen("2026-09-22", "2026-09-25", 2)).toBe(false)
    expect(editWindowOpen("2026-09-26", "2026-09-25", 2)).toBe(false)
  })
})
