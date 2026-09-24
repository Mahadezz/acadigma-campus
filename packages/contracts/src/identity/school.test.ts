import { describe, expect, it } from "vitest"

import {
  checkEiinAvailabilityInputSchema,
  createSchoolDraftSchema,
  createSchoolStep1Schema,
  createSchoolStep2Schema,
  eiinSchema,
  schoolBoardSchema,
  schoolMediumSchema,
  schoolTimezoneSchema,
  workingDaysSchema,
} from "./school"

describe("eiinSchema", () => {
  it("accepts exactly 6 digits", () => {
    expect(eiinSchema.safeParse("123456").success).toBe(true)
  })

  it.each(["12345", "1234567", "12345a", ""])("rejects %s", (value) => {
    expect(eiinSchema.safeParse(value).success).toBe(false)
  })
})

describe("schoolTimezoneSchema", () => {
  it("accepts Asia/Dhaka", () => {
    expect(schoolTimezoneSchema.safeParse("Asia/Dhaka").success).toBe(true)
  })

  it("accepts any other real IANA zone", () => {
    expect(schoolTimezoneSchema.safeParse("America/New_York").success).toBe(
      true
    )
  })

  it("rejects a made-up zone", () => {
    expect(schoolTimezoneSchema.safeParse("Mars/Olympus_Mons").success).toBe(
      false
    )
  })

  it("has no default — omitted stays omitted on a partial draft", () => {
    expect(schoolTimezoneSchema.safeParse(undefined).success).toBe(false)
    // (i.e. it is the caller's job to make the field optional; this schema
    // itself never silently fills one in, unlike ../common's timezoneSchema)
  })
})

describe("workingDaysSchema", () => {
  it("accepts the Sat-Thu default", () => {
    expect(workingDaysSchema.safeParse([6, 7, 1, 2, 3, 4]).success).toBe(true)
  })

  it("rejects an empty selection", () => {
    expect(workingDaysSchema.safeParse([]).success).toBe(false)
  })

  it("rejects an out-of-range day", () => {
    expect(workingDaysSchema.safeParse([0]).success).toBe(false)
    expect(workingDaysSchema.safeParse([8]).success).toBe(false)
  })

  it("rejects a duplicate day", () => {
    expect(workingDaysSchema.safeParse([6, 6]).success).toBe(false)
  })
})

describe("schoolBoardSchema / schoolMediumSchema", () => {
  it("accepts every board §4.3 lists", () => {
    for (const board of schoolBoardSchema.options) {
      expect(schoolBoardSchema.safeParse(board).success).toBe(true)
    }
  })

  it("accepts every medium §4.3 lists", () => {
    for (const medium of schoolMediumSchema.options) {
      expect(schoolMediumSchema.safeParse(medium).success).toBe(true)
    }
  })

  it("rejects an unknown board", () => {
    expect(schoolBoardSchema.safeParse("narnia").success).toBe(false)
  })
})

describe("createSchoolStep1Schema", () => {
  it("accepts a full step-1 submission without an EIIN", () => {
    expect(
      createSchoolStep1Schema.safeParse({
        name: "Ideal School & College",
        board: "dhaka",
        medium: "bangla",
      }).success
    ).toBe(true)
  })

  it("accepts a step-1 submission with an EIIN", () => {
    expect(
      createSchoolStep1Schema.safeParse({
        name: "Ideal School & College",
        eiin: "123456",
        board: "dhaka",
        medium: "bangla",
      }).success
    ).toBe(true)
  })

  it("rejects a missing board", () => {
    expect(
      createSchoolStep1Schema.safeParse({
        name: "Ideal School & College",
        medium: "bangla",
      }).success
    ).toBe(false)
  })

  it("rejects a 1-character name", () => {
    expect(
      createSchoolStep1Schema.safeParse({
        name: "I",
        board: "dhaka",
        medium: "bangla",
      }).success
    ).toBe(false)
  })
})

describe("createSchoolStep2Schema", () => {
  it("accepts a full step-2 submission — shape only, no range check", () => {
    expect(
      createSchoolStep2Schema.safeParse({
        timezone: "Asia/Dhaka",
        working_days: [6, 7, 1, 2, 3, 4],
        academic_year: {
          name: "2026",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
        },
      }).success
    ).toBe(true)
  })

  it("does not itself reject ends_on before starts_on (domain's job)", () => {
    // Shape-valid (two real dates); the day-count/order rule lives in
    // packages/domain/src/academic/year.ts's validateAcademicYearRange.
    expect(
      createSchoolStep2Schema.safeParse({
        timezone: "Asia/Dhaka",
        working_days: [6, 7, 1, 2, 3, 4],
        academic_year: {
          name: "2026",
          starts_on: "2026-12-31",
          ends_on: "2026-01-01",
        },
      }).success
    ).toBe(true)
  })
})

describe("createSchoolDraftSchema", () => {
  it("accepts an empty draft", () => {
    expect(createSchoolDraftSchema.safeParse({}).success).toBe(true)
  })

  it("accepts a step-1-only partial draft", () => {
    expect(
      createSchoolDraftSchema.safeParse({ name: "Ideal School" }).success
    ).toBe(true)
  })

  it("accepts a partial academic_year (name only, no dates yet)", () => {
    expect(
      createSchoolDraftSchema.safeParse({
        academic_year: { name: "2026" },
      }).success
    ).toBe(true)
  })

  it("rejects a malformed eiin even mid-draft", () => {
    expect(createSchoolDraftSchema.safeParse({ eiin: "abc" }).success).toBe(
      false
    )
  })

  it("passes through an unknown key (forward-compat with Part 4's fields)", () => {
    const parsed = createSchoolDraftSchema.safeParse({
      name: "Ideal School",
      grade_levels: [{ name: "Class 6" }],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.grade_levels).toEqual([{ name: "Class 6" }])
    }
  })
})

describe("checkEiinAvailabilityInputSchema", () => {
  it("requires a well-formed eiin", () => {
    expect(
      checkEiinAvailabilityInputSchema.safeParse({ eiin: "123456" }).success
    ).toBe(true)
    expect(
      checkEiinAvailabilityInputSchema.safeParse({ eiin: "12" }).success
    ).toBe(false)
  })
})
