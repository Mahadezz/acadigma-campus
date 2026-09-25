import { describe, expect, it } from "vitest"

import { createSectionInputSchema, createSubjectInputSchema } from "./academics"

const GRADE = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

describe("createSectionInputSchema", () => {
  it("accepts a bare section and turns blank optionals into null", () => {
    const parsed = createSectionInputSchema.parse({
      gradeLevelId: GRADE,
      name: " A ",
      room: "  ",
      capacity: null,
    })
    expect(parsed).toEqual({
      gradeLevelId: GRADE,
      name: "A",
      room: null,
      capacity: null,
    })
  })

  it("rejects a blank name, a huge capacity and unknown keys", () => {
    for (const input of [
      { gradeLevelId: GRADE, name: " " },
      { gradeLevelId: GRADE, name: "A", capacity: 501 },
      { gradeLevelId: GRADE, name: "A", workspaceId: GRADE },
    ]) {
      expect(createSectionInputSchema.safeParse(input).success).toBe(false)
    }
  })
})

describe("createSubjectInputSchema", () => {
  const base = { name: "Physics", category: "core", subjectKind: "compulsory" }

  it("upper-cases the code and treats an empty code as none", () => {
    expect(createSubjectInputSchema.parse({ ...base, code: "phy" }).code).toBe(
      "PHY"
    )
    expect(createSubjectInputSchema.parse({ ...base, code: "" }).code).toBe(
      null
    )
  })

  it("rejects a code with symbols and an unknown category", () => {
    expect(
      createSubjectInputSchema.safeParse({ ...base, code: "PH!" }).success
    ).toBe(false)
    expect(
      createSubjectInputSchema.safeParse({ ...base, category: "sports" })
        .success
    ).toBe(false)
  })
})
