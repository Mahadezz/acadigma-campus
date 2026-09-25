import { describe, expect, it } from "vitest"

import { parityRows } from "./parity"
import { roundHalfUp } from "./round"

describe("roundHalfUp", () => {
  const rows = parityRows("round")

  it("reads the SQL parity table", () => {
    expect(rows.length).toBeGreaterThanOrEqual(10)
  })

  it.each(rows)(
    "roundHalfUp(%s, %s) = %s — same as app.round_half_up",
    (v, p, e) => {
      expect(roundHalfUp(Number(v), Number(p))).toBe(Number(e))
    }
  )

  it("AC-2: round_half_up(21.5 / 5, 2) = 4.30", () => {
    expect(roundHalfUp(21.5 / 5, 2)).toBe(4.3)
  })

  it("rounds negatives away from zero and handles tiny values", () => {
    expect(roundHalfUp(-1.005, 2)).toBe(-1.01)
    expect(roundHalfUp(1e-7, 2)).toBe(0)
  })
})
