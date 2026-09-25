import { describe, expect, it } from "vitest"

import { isTextSize, isUiMode, resolveUiPrefs } from "./index"

describe("resolveUiPrefs — cookie -> row -> default", () => {
  it("uses the default when there is neither a cookie nor a row", () => {
    expect(resolveUiPrefs({ cookie: {}, row: null })).toEqual({
      uiMode: "full",
      textSize: "normal",
    })
  })

  it("falls back to the row when the cookie is missing", () => {
    expect(
      resolveUiPrefs({
        cookie: {},
        row: { uiMode: "basic", textSize: "large" },
      })
    ).toEqual({ uiMode: "basic", textSize: "large" })
  })

  it("prefers a valid cookie over the row (no-flash first paint)", () => {
    expect(
      resolveUiPrefs({
        cookie: { uiMode: "basic", textSize: "xlarge" },
        row: { uiMode: "full", textSize: "normal" },
      })
    ).toEqual({ uiMode: "basic", textSize: "xlarge" })
  })

  it("ignores a garbage cookie value and falls back to the row", () => {
    expect(
      resolveUiPrefs({
        cookie: { uiMode: "not-a-mode", textSize: "huge" },
        row: { uiMode: "basic", textSize: "large" },
      })
    ).toEqual({ uiMode: "basic", textSize: "large" })
  })

  it("resolves each field independently", () => {
    expect(
      resolveUiPrefs({
        cookie: { textSize: "xlarge" },
        row: { uiMode: "basic", textSize: "normal" },
      })
    ).toEqual({ uiMode: "basic", textSize: "xlarge" })
  })
})

describe("isUiMode / isTextSize", () => {
  it("narrow only the real enum labels", () => {
    expect(isUiMode("basic")).toBe(true)
    expect(isUiMode("compact")).toBe(false)
    expect(isUiMode(null)).toBe(false)
    expect(isUiMode(undefined)).toBe(false)

    expect(isTextSize("xlarge")).toBe(true)
    expect(isTextSize("huge")).toBe(false)
  })
})
