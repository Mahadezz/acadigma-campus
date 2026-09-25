import { describe, expect, it } from "vitest"

import { ageOn } from "./students"

describe("ageOn (§5 rule 3)", () => {
  it("counts completed years and months", () => {
    expect(ageOn("2014-03-09", "2026-09-25")).toEqual({ years: 12, months: 6 })
  })

  it("does not count a month until its day is reached", () => {
    expect(ageOn("2014-03-26", "2026-09-25")).toEqual({ years: 12, months: 5 })
    expect(ageOn("2014-09-25", "2026-09-25")).toEqual({ years: 12, months: 0 })
  })

  it("never goes negative", () => {
    expect(ageOn("2026-10-01", "2026-09-25")).toEqual({ years: 0, months: 0 })
  })
})
