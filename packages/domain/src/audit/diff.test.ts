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
})
