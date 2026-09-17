import { describe, expect, it } from "vitest"

import {
  assertWithinLimit,
  hasModule,
  isUnlimited,
  isWriteAllowedOverLimit,
  remainingCapacity,
} from "./limits"

describe("assertWithinLimit", () => {
  it("allows a create that stays at or under the limit", () => {
    const result = assertWithinLimit(
      { students: 149 },
      { students: 150 },
      "students",
      1
    )
    expect(result.ok).toBe(true)
  })

  it("allows landing exactly AT the limit (<=, not <)", () => {
    const result = assertWithinLimit(
      { students: 149 },
      { students: 150 },
      "students",
      1
    )
    expect(result).toEqual({ ok: true, data: undefined })
  })

  it("blocks the create that would cross the limit — F-CM-06 AC-4 (340/150)", () => {
    const result = assertWithinLimit(
      { students: 340 },
      { students: 150 },
      "students",
      1,
      { planCode: "free", suggestedPlanCode: "starter" }
    )
    expect(result).toEqual({
      ok: false,
      error: {
        code: "LIMIT_EXCEEDED",
        limitKey: "students",
        limit: 150,
        current: 340,
        planCode: "free",
        suggestedPlanCode: "starter",
      },
    })
  })

  it("treats a missing usage entry as zero", () => {
    const result = assertWithinLimit({}, { teachers: 5 }, "teachers", 1)
    expect(result.ok).toBe(true)
  })

  it("treats a null limit as unlimited (-1/NULL sentinel, §3.2)", () => {
    const result = assertWithinLimit(
      { teachers: 1_000_000 },
      { teachers: null },
      "teachers",
      1
    )
    expect(result.ok).toBe(true)
  })

  it("treats a key with no limit row at all as unlimited — ungated defaults open", () => {
    const result = assertWithinLimit({ sections: 999 }, {}, "sections", 1)
    expect(result.ok).toBe(true)
  })

  it("a delete (negative delta) that brings usage back to the limit succeeds", () => {
    // assertWithinLimit only compares the resulting count to the limit — it does not
    // know "delete" from "create". §5.6's blanket "delete is always allowed" is a
    // separate rule (isWriteAllowedOverLimit), because a real over-limit workspace
    // (e.g. 340/150) stays over-limit after removing one row, and a guarded write
    // site never calls this function for a delete in the first place.
    const result = assertWithinLimit(
      { students: 151 },
      { students: 150 },
      "students",
      -1
    )
    expect(result.ok).toBe(true)
  })
})

describe("isUnlimited", () => {
  it("is true for null and for an absent key", () => {
    expect(isUnlimited({ teachers: null }, "teachers")).toBe(true)
    expect(isUnlimited({}, "teachers")).toBe(true)
  })

  it("is false for a numeric limit, including zero", () => {
    expect(isUnlimited({ teachers: 5 }, "teachers")).toBe(false)
    expect(isUnlimited({ teachers: 0 }, "teachers")).toBe(false)
  })
})

describe("remainingCapacity", () => {
  it("returns the headroom left", () => {
    expect(
      remainingCapacity({ students: 140 }, { students: 150 }, "students")
    ).toBe(10)
  })

  it("floors at zero when already over", () => {
    expect(
      remainingCapacity({ students: 340 }, { students: 150 }, "students")
    ).toBe(0)
  })

  it("is null when unlimited", () => {
    expect(
      remainingCapacity({ students: 340 }, { students: null }, "students")
    ).toBeNull()
  })
})

describe("hasModule", () => {
  it("works with an array of enabled module keys", () => {
    expect(hasModule(["academics", "fees"], "fees")).toBe(true)
    expect(hasModule(["academics"], "fees")).toBe(false)
  })

  it("works with a Set of enabled module keys", () => {
    expect(hasModule(new Set(["academics", "fees"]), "fees")).toBe(true)
    expect(hasModule(new Set(["academics"]), "hiring")).toBe(false)
  })
})

describe("isWriteAllowedOverLimit — §5.6 exact semantics", () => {
  it("allows read, export, update and delete", () => {
    expect(isWriteAllowedOverLimit("read")).toBe(true)
    expect(isWriteAllowedOverLimit("export")).toBe(true)
    expect(isWriteAllowedOverLimit("update")).toBe(true)
    expect(isWriteAllowedOverLimit("delete")).toBe(true)
  })

  it("blocks only create", () => {
    expect(isWriteAllowedOverLimit("create")).toBe(false)
  })
})
