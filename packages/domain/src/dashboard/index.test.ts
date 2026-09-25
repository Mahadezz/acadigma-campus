import { describe, expect, it } from "vitest"

import { buildSetupChecklist, trialDaysLeft } from "./index"

const EMPTY = {
  hasSchoolProfile: false,
  teacherCount: 0,
  staffRecordCount: 0,
  hasAcademicYear: false,
  studentCount: 0,
}

describe("buildSetupChecklist", () => {
  it("lists every step, in setup order, as missing for a new school", () => {
    const steps = buildSetupChecklist(EMPTY)
    expect(steps.map((s) => s.key)).toEqual([
      "school_profile",
      "academic_year",
      "teachers",
      "staff_records",
      "students",
    ])
    expect(steps.every((s) => !s.done)).toBe(true)
  })

  it("marks a step done only from its own fact", () => {
    const steps = buildSetupChecklist({
      ...EMPTY,
      hasSchoolProfile: true,
      staffRecordCount: 3,
    })
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]))
    expect(done).toEqual({
      school_profile: true,
      academic_year: false,
      teachers: false,
      staff_records: true,
      students: false,
    })
  })

  it("links each step to the route the school nav uses for it", () => {
    const hrefs = Object.fromEntries(
      buildSetupChecklist(EMPTY).map((s) => [s.key, s.href])
    )
    expect(hrefs).toEqual({
      school_profile: "/app/settings",
      academic_year: "/app/classes",
      teachers: "/app/staff",
      staff_records: "/app/staff",
      students: "/app/students",
    })
  })
})

describe("trialDaysLeft", () => {
  const now = new Date("2026-09-25T04:00:00Z") // 10:00 in Dhaka

  it("is null without a trial", () => {
    expect(trialDaysLeft(null, "Asia/Dhaka", now)).toBeNull()
  })

  it("counts calendar days in the school's timezone", () => {
    expect(trialDaysLeft("2026-10-09T18:00:00Z", "Asia/Dhaka", now)).toBe(15) // 10 Oct 00:00 Dhaka
    expect(trialDaysLeft("2026-10-09T17:00:00Z", "Asia/Dhaka", now)).toBe(14) // 9 Oct 23:00 Dhaka
  })

  it("is 0 on the last day and negative after it", () => {
    expect(trialDaysLeft("2026-09-25T17:00:00Z", "Asia/Dhaka", now)).toBe(0)
    expect(trialDaysLeft("2026-09-23T00:00:00Z", "Asia/Dhaka", now)).toBe(-2)
  })
})
