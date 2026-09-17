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

  it("fails closed when a school workspace resolves with no role", () => {
    // Should never happen in practice (a resolved school membership always
    // carries a role), but `/app` is the widest data surface in the product,
    // so it must never be the fallthrough default. An unresolved role is a
    // resolution failure, and the answer to that is onboarding.
    expect(resolveLandingRoute({ workspaceType: "school" })).toBe(
      LANDING_ROUTES.onboarding
    )
    expect(resolveLandingRoute({ workspaceType: "school", role: null })).toBe(
      LANDING_ROUTES.onboarding
    )
  })

  it("only ever reaches /app through the four school-shell roles", () => {
    // Guards the allowlist itself: if a new WorkspaceRole is added and nobody
    // decides which shell it lands in, it must not silently inherit /app.
    const appRoles = WORKSPACE_ROLES.filter(
      (role) =>
        resolveLandingRoute({ workspaceType: "school", role }) ===
        LANDING_ROUTES.app
    )
    expect(appRoles).toEqual(["owner", "admin", "teacher", "staff"])
  })
})
