import { describe, expect, it } from "vitest"

import { isOwnershipCandidate, removalBlock } from "./membershipExit"

describe("removalBlock", () => {
  it("lets an owner remove anyone but themselves and parents", () => {
    expect(removalBlock("owner", "owner", false)).toBeNull()
    expect(removalBlock("owner", "admin", false)).toBeNull()
    expect(removalBlock("owner", "teacher", false)).toBeNull()
    expect(removalBlock("owner", "staff", false)).toBeNull()
    expect(removalBlock("owner", "owner", true)).toBe("self")
    expect(removalBlock("owner", "parent", false)).toBe("parent")
  })

  it("lets an admin remove non-owners only", () => {
    expect(removalBlock("admin", "teacher", false)).toBeNull()
    expect(removalBlock("admin", "admin", false)).toBeNull()
    expect(removalBlock("admin", "owner", false)).toBe("ownerTarget")
    expect(removalBlock("admin", "admin", true)).toBe("self")
  })

  it("never lets a teacher, staff member or parent remove anyone", () => {
    for (const actor of ["teacher", "staff", "parent"] as const) {
      expect(removalBlock(actor, "teacher", false)).toBe("notAllowed")
    }
  })
})

describe("isOwnershipCandidate", () => {
  it("accepts only active admins and teachers", () => {
    expect(isOwnershipCandidate("admin", "active")).toBe(true)
    expect(isOwnershipCandidate("teacher", "active")).toBe(true)
    expect(isOwnershipCandidate("staff", "active")).toBe(false)
    expect(isOwnershipCandidate("owner", "active")).toBe(false)
    expect(isOwnershipCandidate("parent", "active")).toBe(false)
    expect(isOwnershipCandidate("teacher", "pending")).toBe(false)
    expect(isOwnershipCandidate("admin", "removed")).toBe(false)
  })
})
