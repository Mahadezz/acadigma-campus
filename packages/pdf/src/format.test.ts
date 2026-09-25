import { describe, expect, it } from "vitest"

import { formatDate, formatDateTime, formatNumber } from "./format"

describe("formatNumber", () => {
  it("renders Western digits for en", () => {
    expect(formatNumber(1234, "en")).toBe("1234")
  })

  it("renders Bengali digits for bn", () => {
    expect(formatNumber(1234, "bn")).toBe("১২৩৪")
  })

  it("respects fractionDigits (GPA to 2dp, percentages to 0dp — §5.7(6))", () => {
    expect(formatNumber(4.5, "en", 2)).toBe("4.50")
    expect(formatNumber(4.5, "bn", 2)).toBe("৪.৫০")
    expect(formatNumber(71.4, "en", 0)).toBe("71")
  })

  it("keeps a plain minus sign in both locales", () => {
    expect(formatNumber(-5, "en")).toBe("-5")
    expect(formatNumber(-5, "bn")).toBe("-৫")
  })

  it("prints an em dash for a non-finite value, never blank or 0 (§5.7(8))", () => {
    expect(formatNumber(NaN, "en")).toBe("—")
    expect(formatNumber(Infinity, "bn")).toBe("—")
  })
})

describe("formatDate", () => {
  it("renders DD/MM/YYYY with Western digits for en", () => {
    expect(formatDate("2026-09-25T00:00:00.000Z", "en")).toBe("25/09/2026")
  })

  it("renders the same date with Bengali digits for bn", () => {
    expect(formatDate("2026-09-25T00:00:00.000Z", "bn")).toBe("২৫/০৯/২০২৬")
  })

  it("prints an em dash for an invalid date", () => {
    expect(formatDate("not-a-date", "en")).toBe("—")
  })
})

describe("formatDateTime", () => {
  it("appends HH:MM after the date, per locale", () => {
    expect(formatDateTime("2026-09-25T14:05:00.000Z", "en")).toBe(
      "25/09/2026, 14:05"
    )
    expect(formatDateTime("2026-09-25T14:05:00.000Z", "bn")).toBe(
      "২৫/০৯/২০২৬, ১৪:০৫"
    )
  })
})
