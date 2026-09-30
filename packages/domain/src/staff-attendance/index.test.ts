import { describe, expect, it } from "vitest"

import { checkInCardState } from "./index"

const IN = "2026-10-01T02:00:00Z"
const OUT = "2026-10-01T10:00:00Z"

describe("checkInCardState", () => {
  it("offers check-in on a school day with no row", () => {
    expect(checkInCardState({ isSchoolDay: true, record: null })).toBe(
      "can_check_in"
    )
  })

  it("offers nothing on a non-school day", () => {
    expect(checkInCardState({ isSchoolDay: false, record: null })).toBe(
      "no_school"
    )
  })

  it("shows checked in, then checked out", () => {
    const base = { isSchoolDay: true }
    expect(
      checkInCardState({
        ...base,
        record: { checkInAt: IN, checkOutAt: null },
      })
    ).toBe("checked_in")
    expect(
      checkInCardState({
        ...base,
        record: { checkInAt: IN, checkOutAt: OUT },
      })
    ).toBe("checked_out")
  })

  it("keeps showing a recorded check-in if the day is later declared a holiday", () => {
    expect(
      checkInCardState({
        isSchoolDay: false,
        record: { checkInAt: IN, checkOutAt: null },
      })
    ).toBe("checked_in")
  })
})
