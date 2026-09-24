import { describe, expect, it } from "vitest"

import {
  DEFAULT_WORKING_DAYS,
  deriveFirstDayOfWeek,
  validateAcademicYearRange,
} from "./year"

describe("validateAcademicYearRange", () => {
  it("accepts the default calendar year (1 Jan - 31 Dec)", () => {
    expect(
      validateAcademicYearRange({
        starts_on: "2026-01-01",
        ends_on: "2026-12-31",
      })
    ).toEqual({ ok: true })
  })

  it("accepts the minimum 1-day range", () => {
    expect(
      validateAcademicYearRange({
        starts_on: "2026-01-01",
        ends_on: "2026-01-02",
      })
    ).toEqual({ ok: true })
  })

  it("accepts exactly 730 days", () => {
    expect(
      validateAcademicYearRange({
        starts_on: "2026-01-01",
        ends_on: "2028-01-01",
      })
    ).toEqual({ ok: true })
  })

  it("rejects ends_on equal to starts_on", () => {
    expect(
      validateAcademicYearRange({
        starts_on: "2026-01-01",
        ends_on: "2026-01-01",
      })
    ).toEqual({ ok: false, issue: "ends_before_starts" })
  })

  it("rejects ends_on before starts_on", () => {
    expect(
      validateAcademicYearRange({
        starts_on: "2026-12-31",
        ends_on: "2026-01-01",
      })
    ).toEqual({ ok: false, issue: "ends_before_starts" })
  })

  it("rejects a range longer than 730 days", () => {
    expect(
      validateAcademicYearRange({
        starts_on: "2026-01-01",
        ends_on: "2028-01-02",
      })
    ).toEqual({ ok: false, issue: "too_long" })
  })
})

describe("deriveFirstDayOfWeek", () => {
  it("returns Saturday (6) for the Sat-Thu default", () => {
    expect(deriveFirstDayOfWeek([...DEFAULT_WORKING_DAYS])).toBe(6)
  })

  it("returns Sunday (7) when Saturday is not selected", () => {
    expect(deriveFirstDayOfWeek([7, 1, 2, 3, 4])).toBe(7)
  })

  it("returns Monday (1) for a plain Mon-Fri week", () => {
    expect(deriveFirstDayOfWeek([1, 2, 3, 4, 5])).toBe(1)
  })

  it("ignores input order — Sat-first order wins regardless", () => {
    expect(deriveFirstDayOfWeek([4, 1, 7, 6, 2])).toBe(6)
  })

  it("returns null for an empty selection", () => {
    expect(deriveFirstDayOfWeek([])).toBeNull()
  })
})
