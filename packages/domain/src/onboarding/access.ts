/**
 * F-ID-05 §2 "Roles and permissions" — who may see `/onboarding`. Pure and
 * synchronous, mirroring `resolveLandingRoute`'s split
 * (`../workspace/resolveLanding.ts`): the caller (the `/onboarding` route)
 * does the real `auth.getUser()` I/O and hands this function only the
 * already-resolved shape, so the routing *decision* has no I/O to mock in
 * tests — the Part 2 test list's "redirect matrix (signed out / unverified /
 * no membership / has membership)" is exactly this function's test suite.
 *
 * Deliberately does NOT look at membership count: §2's table allows both "0
 * school memberships" and "≥1 school membership" through to `/onboarding" —
 * the latter is how the workspace switcher's "Create or join a workspace"
 * reaches this route (§4.6). Forcing a 0-membership user onto `/onboarding`
 * at first sign-in is a *routing* decision `resolveLandingRoute` makes
 * elsewhere (F-ID-03 §4.4) — not a gate on this route itself.
 */
export type OnboardingAccessInput = {
  /** `false` for a visitor with no session at all. */
  isSignedIn: boolean
  /** Ignored when `isSignedIn` is `false`. */
  isEmailVerified: boolean
}

export type OnboardingAccessDecision =
  { allow: true } | { allow: false; redirectTo: "/login" | "/verify" }

export function resolveOnboardingAccess(
  input: OnboardingAccessInput
): OnboardingAccessDecision {
  if (!input.isSignedIn) return { allow: false, redirectTo: "/login" }
  if (!input.isEmailVerified) return { allow: false, redirectTo: "/verify" }
  return { allow: true }
}
