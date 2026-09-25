import { describe, expect, it } from "vitest"

import { AUDIT_ACTION_CATALOG } from "../audit"

import {
  buildSetupChecklist,
  isCuratedAuditAction,
  trialDaysLeft,
} from "./index"

const EMPTY = {
  hasSchoolProfile: false,
  teacherCount: 0,
  staffRecordCount: 0,
  currentAcademicYearCount: 0,
  gradeLevelCount: 0,
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

  it("needs both a current academic year and classes for the academic-year step", () => {
    const step = (facts: Partial<typeof EMPTY>) =>
      buildSetupChecklist({ ...EMPTY, ...facts }).find(
        (s) => s.key === "academic_year"
      )?.done
    expect(step({ currentAcademicYearCount: 1 })).toBe(false)
    expect(step({ gradeLevelCount: 10 })).toBe(false)
    expect(step({ currentAcademicYearCount: 1, gradeLevelCount: 10 })).toBe(
      true
    )
  })

  it("links each step to the route the school nav uses for it", () => {
    const hrefs = Object.fromEntries(
      buildSetupChecklist(EMPTY).map((s) => [s.key, s.href])
    )
    expect(hrefs).toEqual({
      school_profile: "/app/settings/branding",
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

describe("isCuratedAuditAction", () => {
  it("keeps curated sentences and drops generic table rows and unknown actions", () => {
    const curated = AUDIT_ACTION_CATALOG[0]?.action ?? ""
    expect(isCuratedAuditAction(curated)).toBe(true)
    expect(isCuratedAuditAction("profiles.update")).toBe(false)
    expect(isCuratedAuditAction("not.a.real.action")).toBe(false)
  })
})
