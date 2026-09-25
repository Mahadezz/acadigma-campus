import { describe, expect, it } from "vitest"

import { saveGradeScaleInputSchema } from "./grading"

const band = {
  letter: "P",
  minPercent: 0,
  maxPercent: 100,
  gradePoint: 1,
  isFail: false,
  sortOrder: 1,
}
const scaleId = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"

describe("saveGradeScaleInputSchema", () => {
  it("accepts a valid scale", () => {
    expect(
      saveGradeScaleInputSchema.safeParse({ scaleId, name: "X", bands: [band] })
        .success
    ).toBe(true)
  })

  it("refuses duplicate letters, empty bands and out-of-range percents", () => {
    expect(
      saveGradeScaleInputSchema.safeParse({
        scaleId,
        name: "X",
        bands: [band, { ...band, letter: "p" }],
      }).success
    ).toBe(false)
    expect(
      saveGradeScaleInputSchema.safeParse({ scaleId, name: "X", bands: [] })
        .success
    ).toBe(false)
    expect(
      saveGradeScaleInputSchema.safeParse({
        scaleId,
        name: "X",
        bands: [{ ...band, maxPercent: 100.5 }],
      }).success
    ).toBe(false)
    expect(
      saveGradeScaleInputSchema.safeParse({
        scaleId,
        name: "X",
        bands: [{ ...band, minPercent: 1.234 }],
      }).success
    ).toBe(false)
  })
})
