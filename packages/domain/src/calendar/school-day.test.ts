import { describe, expect, it } from "vitest"

import { daysInMonth, isSchoolDay, isoDayOfWeek } from "./school-day"

describe("isoDayOfWeek", () => {
  it("returns 1 for Monday and 7 for Sunday", () => {
    expect(isoDayOfWeek("2026-09-28")).toBe(1) // Monday
    expect(isoDayOfWeek("2026-09-27")).toBe(7) // Sunday
    expect(isoDayOfWeek("2026-09-26")).toBe(6) // Saturday
  })
})

describe("daysInMonth", () => {
  it("lists every date of a 30-day month", () => {
    const days = daysInMonth(2026, 9)
    expect(days).toHaveLength(30)
    expect(days[0]).toBe("2026-09-01")
    expect(days[29]).toBe("2026-09-30")
  })

  it("handles February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toHaveLength(29)
    expect(daysInMonth(2026, 2)).toHaveLength(28)
  })
})

const SAT_THU = [6, 7, 1, 2, 3, 4] // BD default working week

describe("isSchoolDay — precedence: override > weekly pattern > holiday > true", () => {
  it("is true on a plain working weekday with nothing else configured", () => {
    expect(isSchoolDay("2026-09-28", SAT_THU, [], new Map())).toBe(true) // Monday
  })

  it("is false on the weekly day off (Friday, ISO 5)", () => {
    expect(isSchoolDay("2026-09-25", SAT_THU, [], new Map())).toBe(false) // Friday
  })

  it("is false inside a holiday range, inclusive of both ends", () => {
    const holidays = [{ startsOn: "2026-09-10", endsOn: "2026-09-12" }]
    expect(isSchoolDay("2026-09-10", SAT_THU, holidays, new Map())).toBe(false)
    expect(isSchoolDay("2026-09-11", SAT_THU, holidays, new Map())).toBe(false)
    expect(isSchoolDay("2026-09-12", SAT_THU, holidays, new Map())).toBe(false)
    expect(isSchoolDay("2026-09-13", SAT_THU, holidays, new Map())).toBe(true)
  })

  it("an override beats the weekly pattern and holidays both ways", () => {
    // Friday forced open (a make-up day).
    const forcedOpen = new Map([["2026-09-25", true]])
    expect(isSchoolDay("2026-09-25", SAT_THU, [], forcedOpen)).toBe(true)
    // A Monday forced closed, even though it is a working day and no holiday.
    const forcedClosed = new Map([["2026-09-28", false]])
    expect(isSchoolDay("2026-09-28", SAT_THU, [], forcedClosed)).toBe(false)
    // An override beats a holiday too.
    const holidays = [{ startsOn: "2026-09-10", endsOn: "2026-09-12" }]
    const forcedOpenInHoliday = new Map([["2026-09-11", true]])
    expect(
      isSchoolDay("2026-09-11", SAT_THU, holidays, forcedOpenInHoliday)
    ).toBe(true)
  })
})
