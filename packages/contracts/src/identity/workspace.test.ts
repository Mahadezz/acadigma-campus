import { describe, expect, it } from "vitest"

import {
  listMyWorkspacesOutputSchema,
  membershipSummarySchema,
  switchWorkspaceInputSchema,
  switchWorkspaceOutputSchema,
} from "./workspace"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"

describe("switchWorkspaceInputSchema", () => {
  it("accepts a well-formed workspace id", () => {
    const result = switchWorkspaceInputSchema.safeParse({
      workspaceId: WORKSPACE_ID,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a non-uuid workspace id", () => {
    const result = switchWorkspaceInputSchema.safeParse({
      workspaceId: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a missing workspace id", () => {
    const result = switchWorkspaceInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe("switchWorkspaceOutputSchema", () => {
  it("accepts school and personal, rejects anything else", () => {
    expect(
      switchWorkspaceOutputSchema.safeParse({
        landingRoute: "/app",
        workspaceType: "school",
      }).success
    ).toBe(true)
    expect(
      switchWorkspaceOutputSchema.safeParse({
        landingRoute: "/personal",
        workspaceType: "personal",
      }).success
    ).toBe(true)
    expect(
      switchWorkspaceOutputSchema.safeParse({
        landingRoute: "/app",
        workspaceType: "seller",
      }).success
    ).toBe(false)
  })
})

describe("membershipSummarySchema", () => {
  const valid = {
    workspaceId: WORKSPACE_ID,
    name: "Acadigma Model School",
    type: "school",
    role: "teacher",
    status: "active",
    logoUrl: null,
  }

  it("accepts a well-formed row, including pending and removed statuses", () => {
    expect(membershipSummarySchema.safeParse(valid).success).toBe(true)
    expect(
      membershipSummarySchema.safeParse({ ...valid, status: "pending" }).success
    ).toBe(true)
    expect(
      membershipSummarySchema.safeParse({ ...valid, status: "removed" }).success
    ).toBe(true)
  })

  it("rejects a role outside the five-role enum (no superadmin)", () => {
    expect(
      membershipSummarySchema.safeParse({ ...valid, role: "superadmin" })
        .success
    ).toBe(false)
  })

  it("requires logoUrl to be present, even if null (never undefined)", () => {
    const { logoUrl: _omit, ...withoutLogo } = valid
    expect(membershipSummarySchema.safeParse(withoutLogo).success).toBe(false)
  })
})

describe("listMyWorkspacesOutputSchema", () => {
  it("accepts an empty array and an array of valid rows", () => {
    expect(listMyWorkspacesOutputSchema.safeParse([]).success).toBe(true)
    expect(
      listMyWorkspacesOutputSchema.safeParse([
        {
          workspaceId: WORKSPACE_ID,
          name: "Personal",
          type: "personal",
          role: "owner",
          status: "active",
          logoUrl: null,
        },
      ]).success
    ).toBe(true)
  })
})
