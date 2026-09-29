import { describe, expect, it } from "vitest"

import {
  createAcademicYearInputSchema,
  createTermInputSchema,
  deleteTermInputSchema,
  setCurrentAcademicYearInputSchema,
  updateExamWeightsInputSchema,
} from "./academic-years"

describe("createAcademicYearInputSchema", () => {
  it("accepts a valid year", () => {
    expect(
      createAcademicYearInputSchema.safeParse({
        name: "2027",
        startsOn: "2027-01-01",
        endsOn: "2027-12-31",
      }).success
    ).toBe(true)
  })

  it("rejects a blank name and extra keys", () => {
    expect(
      createAcademicYearInputSchema.safeParse({
        name: "  ",
        startsOn: "2027-01-01",
        endsOn: "2027-12-31",
      }).success
    ).toBe(false)
    expect(
      createAcademicYearInputSchema.safeParse({
        name: "2027",
        startsOn: "2027-01-01",
        endsOn: "2027-12-31",
        workspaceId: "x",
      }).success
    ).toBe(false)
  })
})

describe("setCurrentAcademicYearInputSchema", () => {
  it("requires a uuid", () => {
    expect(
      setCurrentAcademicYearInputSchema.safeParse({
        academicYearId: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(true)
    expect(
      setCurrentAcademicYearInputSchema.safeParse({ academicYearId: "x" })
        .success
    ).toBe(false)
  })
})

describe("createTermInputSchema", () => {
  const valid = {
    academicYearId: "11111111-1111-1111-1111-111111111111",
    name: "1st Term",
    startsOn: "2026-01-01",
    endsOn: "2026-04-30",
  }

  it("accepts a valid term", () => {
    expect(createTermInputSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a blank name", () => {
    expect(
      createTermInputSchema.safeParse({ ...valid, name: "  " }).success
    ).toBe(false)
  })
})

describe("deleteTermInputSchema", () => {
  it("requires a uuid", () => {
    expect(deleteTermInputSchema.safeParse({ termId: "x" }).success).toBe(
      false
    )
  })
})

describe("updateExamWeightsInputSchema", () => {
  const yearId = "11111111-1111-1111-1111-111111111111"
  const examId = "22222222-2222-2222-2222-222222222222"

  it("accepts a weight map keyed by exam id", () => {
    expect(
      updateExamWeightsInputSchema.safeParse({
        academicYearId: yearId,
        weights: { [examId]: 60 },
      }).success
    ).toBe(true)
  })

  it("accepts an empty map (weighting off)", () => {
    expect(
      updateExamWeightsInputSchema.safeParse({
        academicYearId: yearId,
        weights: {},
      }).success
    ).toBe(true)
  })

  it("rejects a weight outside 0-100 and a non-uuid key", () => {
    expect(
      updateExamWeightsInputSchema.safeParse({
        academicYearId: yearId,
        weights: { [examId]: 101 },
      }).success
    ).toBe(false)
    expect(
      updateExamWeightsInputSchema.safeParse({
        academicYearId: yearId,
        weights: { notAnId: 50 },
      }).success
    ).toBe(false)
  })
})
