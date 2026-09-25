import { describe, expect, it } from "vitest"

import { parityRows } from "./parity"
import {
  BD_GRADE_BANDS,
  bandFor,
  checkCoverage,
  pointsDecreaseAt,
} from "./scale"

/** Independent restatement of PRODUCT-DECISIONS 2.4 for the full-range sweep. */
function bdLetter(pct: number): string {
  if (pct >= 80) return "A+"
  if (pct >= 70) return "A"
  if (pct >= 60) return "A-"
  if (pct >= 50) return "B"
  if (pct >= 40) return "C"
  if (pct >= 33) return "D"
  return "F"
}

describe("bandFor", () => {
  it.each(parityRows("band"))(
    "bandFor(BD, %s) = %s %s — same as app.band_for",
    (pct, letter, point) => {
      const band = bandFor(BD_GRADE_BANDS, Number(pct))
      expect(band?.letter).toBe(letter)
      expect(band?.gradePoint).toBe(Number(point))
    }
  )

  it("does not round before banding (D-302 a)", () => {
    expect(bandFor(BD_GRADE_BANDS, 79.5)?.letter).toBe("A")
    expect(bandFor(BD_GRADE_BANDS, 32.5)?.letter).toBe("F")
    expect(bandFor(BD_GRADE_BANDS, 79.995)).toBeNull()
  })

  it("maps every integer 0-100 and every .99 boundary", () => {
    for (let i = 0; i <= 100; i++) {
      expect(bandFor(BD_GRADE_BANDS, i)?.letter).toBe(bdLetter(i))
      if (i < 100) {
        const x = Number(`${i}.99`) // how a §5.1-rounded percentage arrives
        expect(bandFor(BD_GRADE_BANDS, x)?.letter).toBe(bdLetter(x))
      }
    }
  })

  it("AC-1 / the demo: 72 % is A at grade point 4.00", () => {
    const band = bandFor(BD_GRADE_BANDS, 72)
    expect(band?.letter).toBe("A")
    expect(band?.gradePoint).toBe(4)
  })

  it("returns null outside every band", () => {
    expect(bandFor([], 50)).toBeNull()
    expect(bandFor(BD_GRADE_BANDS, 100.5)).toBeNull()
  })
})

describe("checkCoverage", () => {
  it("accepts the BD scale and an empty set", () => {
    expect(checkCoverage(BD_GRADE_BANDS)).toBeNull()
    expect(checkCoverage([])).toBeNull()
  })

  it("finds a gap, an overlap, a missing 0 and a missing 100", () => {
    expect(
      checkCoverage([
        { minPercent: 0, maxPercent: 38.99 },
        { minPercent: 40, maxPercent: 100 },
      ])
    ).toEqual({ code: "BAND_GAP", at: 3900 })
    expect(
      checkCoverage([
        { minPercent: 0, maxPercent: 40 },
        { minPercent: 40, maxPercent: 100 },
      ])
    ).toEqual({ code: "BAND_OVERLAP", at: 4000 })
    expect(checkCoverage([{ minPercent: 1, maxPercent: 100 }])).toEqual({
      code: "BAND_GAP",
      at: 0,
    })
    expect(checkCoverage([{ minPercent: 0, maxPercent: 99.99 }])).toEqual({
      code: "BAND_GAP",
      at: 10000,
    })
    expect(checkCoverage([{ minPercent: 50, maxPercent: 40 }])).toEqual({
      code: "BAND_OVERLAP",
      at: 5000,
    })
  })
})

describe("pointsDecreaseAt", () => {
  it("accepts the BD scale and finds a band whose point goes down", () => {
    expect(pointsDecreaseAt(BD_GRADE_BANDS)).toBeNull()
    expect(
      pointsDecreaseAt([
        { minPercent: 40, gradePoint: 1 },
        { minPercent: 0, gradePoint: 2 },
      ])
    ).toBe(40)
  })
})
