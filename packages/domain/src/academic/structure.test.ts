import { describe, expect, it } from "vitest"

import { createSubjectInputSchema } from "@acadigma/contracts"

import {
  NCTB_STARTER_SUBJECTS,
  nextSectionName,
  sectionDisplayName,
} from "./structure"

describe("sectionDisplayName (F-AC-01 §5 rule 4)", () => {
  it("joins grade and section with an en dash", () => {
    expect(sectionDisplayName("Class 6", "A")).toBe("Class 6 – A")
    expect(sectionDisplayName("ষষ্ঠ শ্রেণি", "ক")).toBe("ষষ্ঠ শ্রেণি – ক")
  })
})

describe("nextSectionName", () => {
  it("starts at A", () => {
    expect(nextSectionName([])).toBe("A")
  })
  it("takes the first free letter, ignoring case and spaces", () => {
    expect(nextSectionName(["a", " B ", "D"])).toBe("C")
  })
  it("suggests ক, খ … for a Bangla school", () => {
    expect(nextSectionName([], "bn")).toBe("ক")
    expect(nextSectionName(["ক"], "bn")).toBe("খ")
  })
  it("gives up after Z", () => {
    const all = Array.from({ length: 26 }, (_, i) =>
      String.fromCharCode(65 + i)
    )
    expect(nextSectionName(all)).toBe("")
  })
})

describe("NCTB_STARTER_SUBJECTS (§3 Seeds)", () => {
  it("has unique names and codes", () => {
    const names = NCTB_STARTER_SUBJECTS.map((s) => s.name.toLowerCase())
    const codes = NCTB_STARTER_SUBJECTS.map((s) => s.code)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("every entry is a valid createSubject input with a Bangla name", () => {
    for (const s of NCTB_STARTER_SUBJECTS) {
      expect(s.name_bn.length).toBeGreaterThan(0)
      expect(
        createSubjectInputSchema.safeParse({
          name: s.name,
          nameBn: s.name_bn,
          code: s.code,
          category: s.category,
          subjectKind: s.subject_kind,
        }).success
      ).toBe(true)
    }
  })

  it("marks Higher Mathematics as a fourth subject", () => {
    expect(
      NCTB_STARTER_SUBJECTS.find((s) => s.code === "HMATH")?.subject_kind
    ).toBe("optional_fourth")
  })
})
