import { describe, expect, it } from "vitest"

import { marksProgress, parseMarkInput } from "./marks"

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
