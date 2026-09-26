import { describe, expect, it } from "vitest"

import {
  marksEntryWindow,
  marksProgress,
  outsideEntryWindow,
  parseMarkInput,
} from "./marks"

describe("parseMarkInput", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["0", 0],
    ["40", 40],
    ["33.5", 33.5],
    ["49.99", 49.99],
    ["50", 50],
    ["৪৫", 45],
    ["৩৩.৫", 33.5],
  ])("accepts %j as %j", (raw, value) => {
    expect(parseMarkInput(raw, 50)).toEqual({ ok: true, value })
  })

  it.each(["abc", "-1", "1.234", "4,5", "1e2", ".5"])(
    "refuses %j as not a number",
    (raw) => {
      expect(parseMarkInput(raw, 50)).toEqual({
        ok: false,
        issue: "NOT_A_NUMBER",
      })
    }
  )

  it("refuses more than full marks", () => {
    expect(parseMarkInput("50.01", 50)).toEqual({
      ok: false,
      issue: "MARK_OUT_OF_RANGE",
    })
    expect(parseMarkInput("60", 50)).toEqual({
      ok: false,
      issue: "MARK_OUT_OF_RANGE",
    })
  })
})

describe("marksProgress", () => {
  it("counts numbers, absent and exempt as done", () => {
    expect(
      marksProgress([
        { status: "entered" },
        { status: "absent" },
        { status: "exempt" },
        { status: null },
      ])
    ).toEqual({ done: 3, total: 4 })
  })
})

describe("marksEntryWindow (§5.11, D-307)", () => {
  it("opens on the exam date and closes 7 days later by default", () => {
    expect(
      marksEntryWindow({
        examDate: "2026-12-28",
        entryOpensOn: null,
        entryClosesOn: null,
      })
    ).toEqual({ opensOn: "2026-12-28", closesOn: "2027-01-04" })
  })

  it("uses the dates set on the paper over the exam date", () => {
    expect(
      marksEntryWindow({
        examDate: "2026-06-01",
        entryOpensOn: "2026-06-03",
        entryClosesOn: "2026-06-20",
      })
    ).toEqual({ opensOn: "2026-06-03", closesOn: "2026-06-20" })
    expect(
      marksEntryWindow({
        examDate: "2026-06-01",
        entryOpensOn: "2026-06-03",
        entryClosesOn: null,
      }).closesOn
    ).toBe("2026-06-10")
  })

  it("has no limit when no date is known", () => {
    const window = marksEntryWindow({
      examDate: null,
      entryOpensOn: null,
      entryClosesOn: null,
    })
    expect(window).toEqual({ opensOn: null, closesOn: null })
    expect(outsideEntryWindow(window, "2026-06-01")).toBe(false)
  })

  it("includes both ends", () => {
    const window = { opensOn: "2026-06-03", closesOn: "2026-06-10" }
    expect(outsideEntryWindow(window, "2026-06-02")).toBe(true)
    expect(outsideEntryWindow(window, "2026-06-03")).toBe(false)
    expect(outsideEntryWindow(window, "2026-06-10")).toBe(false)
    expect(outsideEntryWindow(window, "2026-06-11")).toBe(true)
  })
})
