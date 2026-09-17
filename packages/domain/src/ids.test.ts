import { describe, expect, it } from "vitest"

import {
  DisplayIdError,
  ID_KINDS,
  formatDisplayId,
  isDisplayId,
  kindForPrefix,
  parseDisplayId,
  type IdKind,
} from "./ids"

describe("formatDisplayId", () => {
  it("renders the documented shape", () => {
    expect(formatDisplayId("student", 2026, 1)).toBe("STU-2026-00001")
    expect(formatDisplayId("invoice", 2026, 99_999)).toBe("INV-2026-99999")
  })

  it("covers every declared kind", () => {
    for (const kind of Object.keys(ID_KINDS) as IdKind[]) {
      expect(formatDisplayId(kind, 2026, 1)).toBe(
        `${ID_KINDS[kind]}-2026-00001`
      )
    }
  })

  it("rejects an implausible year", () => {
    expect(() => formatDisplayId("student", 26, 1)).toThrow(DisplayIdError)
    expect(() => formatDisplayId("student", 10_000, 1)).toThrow(DisplayIdError)
    expect(() => formatDisplayId("student", 2026.5, 1)).toThrow(DisplayIdError)
  })

  it("rejects a sequence outside 1..99999", () => {
    expect(() => formatDisplayId("student", 2026, 0)).toThrow(DisplayIdError)
    expect(() => formatDisplayId("student", 2026, 100_000)).toThrow(
      DisplayIdError
    )
    expect(() => formatDisplayId("student", 2026, 1.5)).toThrow(DisplayIdError)
  })
})

describe("parseDisplayId", () => {
  it("round-trips a formatted id", () => {
    expect(parseDisplayId("STU-2026-00001")).toEqual({
      kind: "student",
      prefix: "STU",
      year: 2026,
      sequence: 1,
    })
  })

  it("tolerates surrounding whitespace and lower case", () => {
    expect(parseDisplayId("  stu-2026-00042  ").sequence).toBe(42)
  })

  it("keeps an unknown but well-formed prefix readable", () => {
    const parsed = parseDisplayId("ZZZ-2026-00001")
    expect(parsed.kind).toBeNull()
    expect(parsed.prefix).toBe("ZZZ")
  })

  it("rejects anything that is not the documented shape", () => {
    for (const bad of [
      "",
      "STU-2026-1",
      "S-2026-00001",
      "STUDENT-2026-00001",
      "2026-00001",
    ]) {
      expect(() => parseDisplayId(bad)).toThrow(DisplayIdError)
    }
  })
})

describe("isDisplayId", () => {
  it("accepts well-formed codes and rejects the rest", () => {
    expect(isDisplayId("stu-2026-00001")).toBe(true)
    expect(isDisplayId("nope")).toBe(false)
  })
})

describe("kindForPrefix", () => {
  it("maps a prefix back to its kind, case-insensitively", () => {
    expect(kindForPrefix("stu")).toBe("student")
    expect(kindForPrefix("PYT")).toBe("payout")
  })

  it("returns null for an unknown prefix", () => {
    expect(kindForPrefix("ZZZ")).toBeNull()
  })
})
