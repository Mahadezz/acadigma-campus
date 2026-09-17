import { describe, expect, it } from "vitest"

import { buildDiffRows, computeChangedFieldNames } from "./diff"

describe("computeChangedFieldNames", () => {
  it("finds a changed value", () => {
    expect(
      computeChangedFieldNames({ role: "teacher" }, { role: "admin" })
    ).toEqual(["role"])
  })

  it("finds an added field", () => {
    expect(computeChangedFieldNames({}, { role: "admin" })).toEqual(["role"])
  })

  it("finds a removed field", () => {
    expect(computeChangedFieldNames({ role: "admin" }, {})).toEqual(["role"])
  })

  it("ignores an unchanged field", () => {
    expect(
      computeChangedFieldNames(
        { role: "admin", name: "Rahim" },
        { role: "admin", name: "Rahim" }
      )
    ).toEqual([])
  })

  it("treats INSERT (before = null) as every field changed", () => {
    expect(
      computeChangedFieldNames(null, { role: "teacher", name: "Rahim" }).sort()
    ).toEqual(["name", "role"])
  })

  it("treats DELETE (after = null) as every field changed", () => {
    expect(
      computeChangedFieldNames({ role: "teacher", name: "Rahim" }, null).sort()
    ).toEqual(["name", "role"])
  })

  it("compares nested objects by value, not reference", () => {
    expect(
      computeChangedFieldNames({ meta: { a: 1 } }, { meta: { a: 1 } })
    ).toEqual([])
    expect(
      computeChangedFieldNames({ meta: { a: 1 } }, { meta: { a: 2 } })
    ).toEqual(["meta"])
  })
})

describe("buildDiffRows", () => {
  it("builds one row per changed field with before/after values", () => {
    const rows = buildDiffRows({ role: "teacher" }, { role: "admin" }, ["role"])
    expect(rows).toEqual([
      {
        field: "role",
        before: "teacher",
        after: "admin",
        isRedactedValue: false,
      },
    ])
  })

  it("falls back to computing changed fields when none are supplied", () => {
    const rows = buildDiffRows({ role: "teacher" }, { role: "admin" }, null)
    expect(rows.map((r) => r.field)).toEqual(["role"])
  })

  it("marks a free-text field (both sides null) as a redacted value", () => {
    const rows = buildDiffRows(
      { body: null, title: "Old" },
      { body: null, title: "New" },
      ["body", "title"]
    )
    const bodyRow = rows.find((r) => r.field === "body")
    expect(bodyRow?.before).toBeNull()
    expect(bodyRow?.after).toBeNull()
    expect(bodyRow?.isRedactedValue).toBe(true)

    const titleRow = rows.find((r) => r.field === "title")
    expect(titleRow?.isRedactedValue).toBe(false)
  })

  it("never renders a secret-deny-listed column even if it somehow appears in changed_fields", () => {
    const rows = buildDiffRows({ api_token: "old" }, { api_token: "new" }, [
      "api_token",
    ])
    expect(rows).toEqual([])
  })

  it("treats a missing side as null", () => {
    const rows = buildDiffRows(null, { role: "teacher" }, ["role"])
    expect(rows).toEqual([
      { field: "role", before: null, after: "teacher", isRedactedValue: false },
    ])
  })

  // Rows written before the redaction migration hold raw contact and health
  // values. The viewer is the last place that could disclose them, so it
  // applies the same §5.3 matrix the trigger now applies at write time.
  it("masks a contact column rather than rendering the address", () => {
    const rows = buildDiffRows(
      { email: "rahim@gmail.com" },
      { email: "karim@yahoo.com" },
      ["email"]
    )
    expect(rows).toEqual([
      {
        field: "email",
        before: "r***@gmail.com",
        after: "k***@yahoo.com",
        isRedactedValue: false,
      },
    ])
  })

  it("nulls a health or religion column and labels it redacted", () => {
    const rows = buildDiffRows(
      { blood_group: "O+", allergies: "peanuts" },
      { blood_group: "A+", allergies: "peanuts, dust" },
      ["blood_group", "allergies"]
    )
    expect(rows.every((r) => r.isRedactedValue)).toBe(true)
    expect(rows.every((r) => r.before === null && r.after === null)).toBe(true)
    // The field NAMES still survive — that is the whole point of §5.3's
    // "field names only" rule.
    expect(rows.map((r) => r.field)).toEqual(["blood_group", "allergies"])
  })

  it("never renders an NID even though it is not literally named 'token'", () => {
    const rows = buildDiffRows(
      { nid_number: "1234567890" },
      { nid_number: "0987654321" },
      ["nid_number"]
    )
    expect(rows).toEqual([])
  })
})
