import { describe, expect, it } from "vitest"

import {
  normalizeBdPhone,
  quickAdmitInputSchema,
  studentSearchQuerySchema,
} from "./students"

const KEY = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"
const SECTION = "6a1d3b2f-9c8e-4d4b-8f70-2b3c4d5e6f7a"

const valid = {
  idempotencyKey: KEY,
  firstName: " Rahim ",
  lastName: "Uddin",
  fullNameBn: "রহিম উদ্দিন",
  gender: "male",
  dateOfBirth: "2014-03-09",
  sectionId: SECTION,
  guardian: {
    relation: "father",
    fullName: "Karim Uddin",
    phone: "01712345678",
  },
}

describe("normalizeBdPhone (§5 rule 8)", () => {
  it("turns the usual local spellings into E.164", () => {
    for (const input of [
      "01712345678",
      "8801712345678",
      "+8801712345678",
      "+880 1712-345678",
      " 017 1234 5678 ",
    ]) {
      expect(normalizeBdPhone(input)).toBe("+8801712345678")
    }
  })

  it("leaves anything else for the format check to refuse", () => {
    expect(normalizeBdPhone("01212345678")).toBe("01212345678")
    expect(normalizeBdPhone("12345")).toBe("12345")
  })
})

describe("quickAdmitInputSchema", () => {
  it("accepts the five required fields and normalises name and phone", () => {
    const parsed = quickAdmitInputSchema.parse(valid)
    expect(parsed.firstName).toBe("Rahim")
    expect(parsed.guardian.phone).toBe("+8801712345678")
    expect(parsed.guardian.fullNameBn).toBeUndefined()
  })

  it("turns a blank Bangla name into null", () => {
    expect(
      quickAdmitInputSchema.parse({ ...valid, fullNameBn: "  " }).fullNameBn
    ).toBeNull()
  })

  it("refuses a bad phone, a future or malformed date, a zero roll and unknown keys", () => {
    for (const input of [
      { ...valid, guardian: { ...valid.guardian, phone: "01212345678" } },
      { ...valid, dateOfBirth: "2999-01-01" },
      { ...valid, dateOfBirth: "09/03/2014" },
      { ...valid, rollNumber: 0 },
      { ...valid, lastName: " " },
      { ...valid, workspaceId: KEY },
      { ...valid, gender: "robot" },
    ]) {
      expect(quickAdmitInputSchema.safeParse(input).success).toBe(false)
    }
  })
})

describe("studentSearchQuerySchema", () => {
  it("defaults to page 1 and coerces a page string", () => {
    expect(studentSearchQuerySchema.parse({}).page).toBe(1)
    expect(studentSearchQuerySchema.parse({ page: "3" }).page).toBe(3)
  })

  it("normalises a Bangla query to NFC", () => {
    const decomposed = "কো" // ক + ে + া, not the composed ো
    expect(studentSearchQuerySchema.parse({ q: decomposed }).q).toBe(
      decomposed.normalize("NFC")
    )
    expect(
      quickAdmitInputSchema.parse({ ...valid, fullNameBn: decomposed })
        .fullNameBn
    ).toBe("কো")
  })

  it("refuses a section that is not a uuid", () => {
    expect(
      studentSearchQuerySchema.safeParse({ sectionId: "6-ka" }).success
    ).toBe(false)
  })
})
