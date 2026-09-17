import { describe, expect, it } from "vitest"

import {
  DEFAULT_TIMEZONE,
  TimeError,
  addDays,
  clockTimeIn,
  compareDates,
  daysBetween,
  endOfDayUtc,
  formatIsoDate,
  isIsoDate,
  isToday,
  startOfDayUtc,
  todayIn,
  zoneOffsetMillis,
} from "./time"

/** 2026-09-16 18:00 UTC is exactly midnight on 2026-09-17 in Dhaka (UTC+6). */
const DHAKA_MIDNIGHT = new Date("2026-09-16T18:00:00Z")

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-09-17")).toBe(true)
    expect(isIsoDate("2024-02-29")).toBe(true)
  })

  it("rejects days that do not exist", () => {
    expect(isIsoDate("2026-02-31")).toBe(false)
    expect(isIsoDate("2025-02-29")).toBe(false)
  })

  it("rejects anything that is not YYYY-MM-DD", () => {
    for (const bad of ["", "17-09-2026", "2026-9-17", "2026-09-17T00:00:00Z"]) {
      expect(isIsoDate(bad)).toBe(false)
    }
  })
})

describe("todayIn", () => {
  it("uses the workspace timezone, not the server's", () => {
    // Half an hour before UTC midnight it is already tomorrow in Dhaka.
    const instant = new Date("2026-09-16T23:30:00Z")
    expect(todayIn("UTC", instant)).toBe("2026-09-16")
    expect(todayIn(DEFAULT_TIMEZONE, instant)).toBe("2026-09-17")
  })

  it("defaults to Asia/Dhaka", () => {
    const instant = new Date("2026-09-16T20:00:00Z")
    expect(todayIn(undefined, instant)).toBe("2026-09-17")
  })

  it("treats the first instant of a Dhaka day as that day", () => {
    expect(todayIn(DEFAULT_TIMEZONE, DHAKA_MIDNIGHT)).toBe("2026-09-17")
  })
})

describe("clockTimeIn", () => {
  it("reports 24-hour wall-clock time in the zone", () => {
    expect(clockTimeIn(DEFAULT_TIMEZONE, DHAKA_MIDNIGHT)).toBe("00:00")
    expect(clockTimeIn("UTC", DHAKA_MIDNIGHT)).toBe("18:00")
    expect(clockTimeIn(undefined, DHAKA_MIDNIGHT)).toBe("00:00")
  })
})

describe("isToday", () => {
  it("compares calendar days in the workspace zone", () => {
    const now = new Date("2026-09-17T04:00:00Z") // 10:00 in Dhaka
    expect(isToday(DHAKA_MIDNIGHT, DEFAULT_TIMEZONE, now)).toBe(true)
    expect(
      isToday(new Date("2026-09-15T04:00:00Z"), DEFAULT_TIMEZONE, now)
    ).toBe(false)
  })

  it("defaults the zone and the clock", () => {
    expect(isToday(new Date())).toBe(true)
  })
})

describe("addDays", () => {
  it("moves forward and backward", () => {
    expect(addDays("2026-09-17", 1)).toBe("2026-09-18")
    expect(addDays("2026-09-17", -1)).toBe("2026-09-16")
    expect(addDays("2026-09-17", 0)).toBe("2026-09-17")
  })

  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29")
  })

  it("rejects a bad date or a fractional offset", () => {
    expect(() => addDays("nope", 1)).toThrow(TimeError)
    expect(() => addDays("2026-09-17", 1.5)).toThrow(TimeError)
  })
})

describe("daysBetween", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-09-17", "2026-09-20")).toBe(3)
    expect(daysBetween("2026-09-20", "2026-09-17")).toBe(-3)
    expect(daysBetween("2026-09-17", "2026-09-17")).toBe(0)
  })

  it("rejects bad input on either side", () => {
    expect(() => daysBetween("nope", "2026-09-17")).toThrow(TimeError)
    expect(() => daysBetween("2026-09-17", "nope")).toThrow(TimeError)
  })
})

describe("compareDates", () => {
  it("sorts chronologically", () => {
    const dates = ["2026-09-20", "2026-09-17", "2026-09-18"]
    expect([...dates].sort(compareDates)).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-20",
    ])
  })

  it("returns zero for equal dates", () => {
    expect(compareDates("2026-09-17", "2026-09-17")).toBe(0)
  })

  it("rejects bad input on either side", () => {
    expect(() => compareDates("nope", "2026-09-17")).toThrow(TimeError)
    expect(() => compareDates("2026-09-17", "nope")).toThrow(TimeError)
  })
})

describe("startOfDayUtc / endOfDayUtc", () => {
  it("anchors a Dhaka day to 18:00 UTC the day before", () => {
    expect(startOfDayUtc("2026-09-17").toISOString()).toBe(
      "2026-09-16T18:00:00.000Z"
    )
  })

  it("is the identity in UTC", () => {
    expect(startOfDayUtc("2026-09-17", "UTC").toISOString()).toBe(
      "2026-09-17T00:00:00.000Z"
    )
  })

  it("handles a half-hour offset zone", () => {
    expect(startOfDayUtc("2026-09-17", "Asia/Kolkata").toISOString()).toBe(
      "2026-09-16T18:30:00.000Z"
    )
  })

  it("ends a day exactly where the next one starts", () => {
    expect(endOfDayUtc("2026-09-17").toISOString()).toBe(
      startOfDayUtc("2026-09-18").toISOString()
    )
  })

  it("rejects a bad date", () => {
    expect(() => startOfDayUtc("nope")).toThrow(TimeError)
  })
})

describe("zoneOffsetMillis", () => {
  it("reports Dhaka as six hours ahead", () => {
    expect(zoneOffsetMillis(DHAKA_MIDNIGHT, DEFAULT_TIMEZONE)).toBe(
      6 * 3_600_000
    )
  })

  it("reports UTC as zero", () => {
    expect(zoneOffsetMillis(DHAKA_MIDNIGHT, "UTC")).toBe(0)
  })

  it("reports a negative offset west of Greenwich", () => {
    expect(
      zoneOffsetMillis(new Date("2026-01-15T12:00:00Z"), "America/New_York")
    ).toBe(-5 * 3_600_000)
  })
})

describe("formatIsoDate", () => {
  it("renders a date the way a school reads it", () => {
    // Day, abbreviated month, year. The abbreviation is CLDR's to choose - en-GB is
    // "Sep" on some ICU versions and "Sept" on others - so assert the shape rather
    // than one runtime's spelling.
    expect(formatIsoDate("2026-09-17")).toMatch(/^17 Sept? 2026$/)
  })

  it("accepts an explicit locale and zone", () => {
    expect(formatIsoDate("2026-09-17", "en-US", "UTC")).toMatch(
      /^Sept? 17, 2026$/
    )
  })

  it("rejects a bad date", () => {
    expect(() => formatIsoDate("nope")).toThrow(TimeError)
  })
})
