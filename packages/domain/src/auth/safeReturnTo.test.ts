import { describe, expect, it } from "vitest"

import { safeReturnTo } from "./safeReturnTo"

const FALLBACK = "/app/dashboard"

describe("safeReturnTo — accepts legitimate same-origin paths", () => {
  it("passes through a root-relative path unchanged", () => {
    expect(safeReturnTo("/app/attendance", FALLBACK)).toEqual({
      path: "/app/attendance",
      rejected: false,
    })
  })

  it("keeps a query string and hash", () => {
    expect(safeReturnTo("/app/marks/abc?tab=grid#top", FALLBACK)).toEqual({
      path: "/app/marks/abc?tab=grid#top",
      rejected: false,
    })
  })

  it("treats a missing value as the fallback, not a rejection", () => {
    expect(safeReturnTo(undefined, FALLBACK)).toEqual({
      path: FALLBACK,
      rejected: false,
    })
    expect(safeReturnTo(null, FALLBACK)).toEqual({
      path: FALLBACK,
      rejected: false,
    })
    expect(safeReturnTo("", FALLBACK)).toEqual({
      path: FALLBACK,
      rejected: false,
    })
  })
})

describe("safeReturnTo — rejects an attempt to leave the origin", () => {
  const attacks: { name: string; value: string }[] = [
    { name: "protocol-relative //", value: "//evil.example" },
    { name: "protocol-relative with path", value: "//evil.example/phish" },
    { name: "absolute https URL", value: "https://evil.example/" },
    { name: "absolute http URL", value: "http://evil.example" },
    { name: "backslash variant", value: "/\\evil.example" },
    { name: "double backslash", value: "\\\\evil.example" },
    { name: "percent-encoded //", value: "/%2F%2Fevil.example" },
    { name: "double-encoded //", value: "/%252F%252Fevil.example" },
    { name: "no leading slash at all", value: "evil.example" },
    { name: "encoded backslash", value: "/%5C%5Cevil.example" },
    { name: "embedded control char (encoded newline)", value: "/app%0A/evil" },
  ]

  it.each(attacks)(
    "$name -> falls back and is marked rejected",
    ({ value }) => {
      const result = safeReturnTo(value, FALLBACK)
      expect(result).toEqual({ path: FALLBACK, rejected: true })
    }
  )
})

describe("safeReturnTo — AC16", () => {
  it("a crafted next=https://evil.example/ falls back to the resolved landing route", () => {
    const result = safeReturnTo("https://evil.example/", "/onboarding")
    expect(result.path).toBe("/onboarding")
    expect(result.rejected).toBe(true)
  })
})
