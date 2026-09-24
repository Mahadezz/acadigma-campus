import { describe, expect, it } from "vitest"

import { resolveOnboardingAccess } from "./access"

describe("resolveOnboardingAccess", () => {
  // The redirect matrix from F-ID-05 §2 / §8 Part 2 tests: signed out,
  // unverified, no membership, has membership.
  it("sends a signed-out visitor to /login", () => {
    expect(
      resolveOnboardingAccess({ isSignedIn: false, isEmailVerified: false })
    ).toEqual({ allow: false, redirectTo: "/login" })
  })

  it("ignores isEmailVerified when signed out", () => {
    expect(
      resolveOnboardingAccess({ isSignedIn: false, isEmailVerified: true })
    ).toEqual({ allow: false, redirectTo: "/login" })
  })

  it("sends a signed-in, unverified user to /verify", () => {
    expect(
      resolveOnboardingAccess({ isSignedIn: true, isEmailVerified: false })
    ).toEqual({ allow: false, redirectTo: "/verify" })
  })

  it("allows a verified user with no school membership through", () => {
    expect(
      resolveOnboardingAccess({ isSignedIn: true, isEmailVerified: true })
    ).toEqual({ allow: true })
  })

  it("allows a verified user with existing memberships through too — membership count is not this gate's job", () => {
    // §2: reachable from the switcher's "Create or join a workspace" even
    // with ≥1 membership already. This function takes no membership input at
    // all, so "has membership" is simply the same allow=true case again.
    expect(
      resolveOnboardingAccess({ isSignedIn: true, isEmailVerified: true })
    ).toEqual({ allow: true })
  })
})
