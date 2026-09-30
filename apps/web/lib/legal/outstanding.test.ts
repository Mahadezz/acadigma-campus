import { describe, expect, it } from "vitest"

import { LEGAL_DOCUMENTS } from "./documents"
import { legalScopeFor, outstandingDocuments } from "./outstanding"

const SCHOOL = "1c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"
const OTHER = "2c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

const row = (
  document: "terms" | "privacy" | "dpa",
  workspaceId: string | null = null,
  version: string = LEGAL_DOCUMENTS[document].version
) => ({ document, version, workspaceId })

describe("outstandingDocuments (D-115)", () => {
  it("asks for Terms and Privacy when a pre-D-114 account has no rows", () => {
    expect(outstandingDocuments([], { ownedSchoolId: null })).toEqual([
      "terms",
      "privacy",
    ])
  })

  it("asks nothing when the current versions are accepted", () => {
    expect(
      outstandingDocuments([row("terms"), row("privacy")], {
        ownedSchoolId: null,
      })
    ).toEqual([])
  })

  it("asks again when only an older version was accepted", () => {
    expect(
      outstandingDocuments(
        [row("terms"), row("privacy", null, "2026-09-30-interim")],
        { ownedSchoolId: null }
      )
    ).toEqual(["privacy"])
  })

  it("asks a school's owner for its DPA; another school's DPA does not count", () => {
    const base = [row("terms"), row("privacy")]
    expect(
      outstandingDocuments([...base, row("dpa", OTHER)], {
        ownedSchoolId: SCHOOL,
      })
    ).toEqual(["dpa"])
    expect(
      outstandingDocuments([...base, row("dpa", SCHOOL)], {
        ownedSchoolId: SCHOOL,
      })
    ).toEqual([])
  })

  it("a Terms row recorded against a school does not satisfy the personal one", () => {
    expect(
      outstandingDocuments([row("terms", SCHOOL), row("privacy")], {
        ownedSchoolId: null,
      })
    ).toEqual(["terms"])
  })
})

describe("legalScopeFor", () => {
  it("only a school's owner answers for its DPA", () => {
    const ctx = { workspaceId: SCHOOL, workspaceType: "school" }
    expect(legalScopeFor({ ...ctx, role: "owner" })).toEqual({
      ownedSchoolId: SCHOOL,
    })
    for (const role of ["admin", "teacher", "staff", "parent"]) {
      expect(legalScopeFor({ ...ctx, role })).toEqual({ ownedSchoolId: null })
    }
    expect(
      legalScopeFor({
        workspaceId: SCHOOL,
        workspaceType: "personal",
        role: "owner",
      })
    ).toEqual({ ownedSchoolId: null })
  })
})
