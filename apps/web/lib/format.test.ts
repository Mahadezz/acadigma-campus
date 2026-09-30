import { describe, expect, it } from "vitest"

import { formatDhakaDate } from "./format"

describe("formatDhakaDate", () => {
  it("uses Bangladesh time, not UTC", () => {
    // 20:00 UTC on 29 Oct is 02:00 on 30 Oct in Dhaka.
    expect(formatDhakaDate("2026-10-29T20:00:00Z", "en")).toBe("30 Oct 2026")
  })

  it("keeps Western digits in Bangla", () => {
    expect(formatDhakaDate("2026-10-29T20:00:00Z", "bn")).toMatch(/30.*2026/)
  })
})
