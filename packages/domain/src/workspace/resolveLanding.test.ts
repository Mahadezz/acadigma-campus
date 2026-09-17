import { describe, expect, it } from "vitest"

import { WORKSPACE_ROLES } from "../permissions"

import { LANDING_ROUTES, resolveLandingRoute } from "./resolveLanding"

describe("resolveLandingRoute", () => {
  it("sends a user with no active membership to onboarding", () => {
    expect(resolveLandingRoute({ workspaceType: null })).toBe(
      LANDING_ROUTES.onboarding
    )
  })

  it("ignores a stray role when there is no membership", () => {
    expect(resolveLandingRoute({ workspaceType: null, role: "owner" })).toBe(
      LANDING_ROUTES.onboarding
    )
  })

  it("sends every personal-workspace role to /personal", () => {
    // A personal workspace has exactly one member, always 'owner' (F-ID-03 §2),
    // but the resolver does not even need to look at role for type=personal.
    expect(
      resolveLandingRoute({ workspaceType: "personal", role: "owner" })
    ).toBe(LANDING_ROUTES.personal)
    expect(resolveLandingRoute({ workspaceType: "personal" })).toBe(
      LANDING_ROUTES.personal
    )
  })

  it("sends a school parent to /family, never /app", () => {
    expect(
      resolveLandingRoute({ workspaceType: "school", role: "parent" })
    ).toBe(LANDING_ROUTES.family)
  })

  it("sends every other school role to /app (OQ-1: role is the tie-break)", () => {
    const staffShellRoles = WORKSPACE_ROLES.filter((r) => r !== "parent")
    for (const role of staffShellRoles) {
      expect(resolveLandingRoute({ workspaceType: "school", role })).toBe(
        LANDING_ROUTES.app
      )
    }
  })

  it("treats a missing role on a school workspace as staff-shell, not a crash", () => {
    // Should never happen in practice (a resolved school membership always carries
    // a role), but the function must fail toward the safer generic shell rather
    // than throw.
    expect(resolveLandingRoute({ workspaceType: "school" })).toBe(
      LANDING_ROUTES.app
    )
  })
})
