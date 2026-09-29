import { describe, expect, it } from "vitest"

import { checkExamWeights, checkTermRange, examWeightSum } from "./terms"

const YEAR = { starts_on: "2026-01-01", ends_on: "2026-12-31" }

describe("checkTermRange", () => {
  it("accepts a term inside the year with no other terms", () => {
    expect(
      checkTermRange(
        YEAR,
        { starts_on: "2026-01-01", ends_on: "2026-04-30" },
        []
      )
    ).toBeNull()
  })

  it("accepts two adjacent, non-overlapping terms", () => {
    const existing = [
      { id: "t1", starts_on: "2026-01-01", ends_on: "2026-04-30" },
    ]
    expect(
      checkTermRange(
        YEAR,
        { id: "t2", starts_on: "2026-05-01", ends_on: "2026-08-31" },
        existing
      )
    ).toBeNull()
  })

  it("rejects a term ending before it starts", () => {
    expect(
      checkTermRange(
        YEAR,
        { starts_on: "2026-04-30", ends_on: "2026-01-01" },
        []
      )
    ).toBe("TERM_ENDS_BEFORE_STARTS")
  })

  it("rejects a term starting before the year", () => {
    expect(
      checkTermRange(
        YEAR,
        { starts_on: "2025-12-31", ends_on: "2026-04-30" },
        []
      )
    ).toBe("TERM_OUTSIDE_YEAR")
  })

  it("rejects a term ending after the year", () => {
    expect(
      checkTermRange(
        YEAR,
        { starts_on: "2026-10-01", ends_on: "2027-01-01" },
        []
      )
    ).toBe("TERM_OUTSIDE_YEAR")
  })

  it("rejects a term overlapping an existing one", () => {
    const existing = [
      { id: "t1", starts_on: "2026-01-01", ends_on: "2026-04-30" },
    ]
    expect(
      checkTermRange(
        YEAR,
        { id: "t2", starts_on: "2026-04-30", ends_on: "2026-08-31" },
        existing
      )
    ).toBe("TERM_OVERLAP")
  })

  it("rejects a term wholly inside an existing one", () => {
    const existing = [
      { id: "t1", starts_on: "2026-01-01", ends_on: "2026-12-31" },
    ]
    expect(
      checkTermRange(
        YEAR,
        { id: "t2", starts_on: "2026-04-01", ends_on: "2026-05-01" },
        existing
      )
    ).toBe("TERM_OVERLAP")
  })

  it("excludes the term's own id from the overlap check (editing in place)", () => {
    const existing = [
      { id: "t1", starts_on: "2026-01-01", ends_on: "2026-04-30" },
    ]
    expect(
      checkTermRange(
        YEAR,
        { id: "t1", starts_on: "2026-01-15", ends_on: "2026-04-30" },
        existing
      )
    ).toBeNull()
  })
})

describe("examWeightSum / checkExamWeights", () => {
  it("sums weights", () => {
    expect(examWeightSum({ a: 30, b: 70 })).toBe(100)
  })

  it("an empty map is weighting-off, always valid", () => {
    expect(checkExamWeights({})).toBeNull()
  })

  it("accepts a sum of exactly 100", () => {
    expect(checkExamWeights({ a: 30, b: 70 })).toBeNull()
  })

  it("accepts a sum of 100 across three fractional weights", () => {
    expect(checkExamWeights({ a: 33.33, b: 33.33, c: 33.34 })).toBeNull()
  })

  it("rejects a sum under 100", () => {
    expect(checkExamWeights({ a: 30, b: 60 })).toBe("WEIGHTS_NOT_100")
  })

  it("rejects a sum over 100", () => {
    expect(checkExamWeights({ a: 60, b: 60 })).toBe("WEIGHTS_NOT_100")
  })
})
