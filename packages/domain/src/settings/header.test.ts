import { describe, expect, it } from "vitest"

import { renderHeaderLine, unknownHeaderTokens } from "./header"

describe("renderHeaderLine", () => {
  it("fills known tokens from the profile", () => {
    expect(
      renderHeaderLine("{address_line1}, {city}", {
        address_line1: "12 Lake Road",
        city: "Dhaka",
      })
    ).toBe("12 Lake Road, Dhaka")
  })

  it("renders a missing value and an unknown token as empty", () => {
    expect(renderHeaderLine("EIIN {eiin} {nope} Board", {})).toBe("EIIN Board")
  })

  it("leaves literal text and stray braces alone", () => {
    expect(
      renderHeaderLine("Phone {contact_phone} {x", { contact_phone: "017" })
    ).toBe("Phone 017 {x")
  })
})

describe("unknownHeaderTokens", () => {
  it("names each unknown token once, and ignores known ones", () => {
    expect(
      unknownHeaderTokens("{city} {school_name} {school_name} {foo}")
    ).toEqual(["school_name", "foo"])
  })

  it("is empty for a template with only known tokens", () => {
    expect(unknownHeaderTokens("{legal_name} · EIIN {eiin}")).toEqual([])
  })
})
