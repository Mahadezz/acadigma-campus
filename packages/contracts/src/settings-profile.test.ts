import { describe, expect, it } from "vitest"

import {
  updateBrandingInputSchema,
  updateSchoolProfileInputSchema,
} from "./settings"

const version = "2026-09-25T10:00:00.123456+00:00"

describe("updateSchoolProfileInputSchema", () => {
  it("accepts a partial patch and lowercases the email", () => {
    const result = updateSchoolProfileInputSchema.safeParse({
      version,
      profile: { legal_name: "Lakeview School", contact_email: "Office@X.bd" },
    })
    expect(result.success && result.data.profile.contact_email).toBe(
      "office@x.bd"
    )
  })

  it("accepts null to clear an optional field", () => {
    expect(
      updateSchoolProfileInputSchema.safeParse({
        version,
        profile: { eiin: null, motto: null },
      }).success
    ).toBe(true)
  })

  it("rejects a 5-digit EIIN, an unknown board and a blank city", () => {
    for (const profile of [
      { eiin: "12345" },
      { board: "BD National" },
      { city: "  " },
    ]) {
      expect(
        updateSchoolProfileInputSchema.safeParse({ version, profile }).success
      ).toBe(false)
    }
  })

  it("rejects an unknown column and a missing version", () => {
    expect(
      updateSchoolProfileInputSchema.safeParse({
        version,
        profile: { workspace_id: "x" },
      }).success
    ).toBe(false)
    expect(
      updateSchoolProfileInputSchema.safeParse({ profile: {} }).success
    ).toBe(false)
  })
})

describe("updateBrandingInputSchema", () => {
  it("accepts header lines and a hex accent", () => {
    expect(
      updateBrandingInputSchema.safeParse({
        version,
        branding: { header_line_1: "{city}", accent: "#1F4E79" },
      }).success
    ).toBe(true)
  })

  it("rejects a non-hex accent and a logo_file_id (upload deferred, D-200)", () => {
    expect(
      updateBrandingInputSchema.safeParse({
        version,
        branding: { accent: "navy" },
      }).success
    ).toBe(false)
    expect(
      updateBrandingInputSchema.safeParse({
        version,
        branding: { logo_file_id: null },
      }).success
    ).toBe(false)
  })
})
