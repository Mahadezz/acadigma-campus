import type { WorkspaceRole } from "../permissions"

/**
 * Which shell a resolved workspace sends the signed-in user to
 * (F-ID-03 §4.4). This is deliberately **type ∧ role**, not type alone:
 * PRODUCT-DECISIONS §1.1 says "the active workspace's type decides", but a
 * `parent` membership lives inside a `school` workspace whose `/app` shell
 * they must never see (OQ-1, resolved in favour of the table below — role is
 * the tie-break).
 *
 * Pure and synchronous on purpose: the caller (`apps/web/lib/resolve-landing-route.ts`)
 * does the actual `workspace_members` read and hands this function only the
 * already-resolved shape, so the routing *decision* has no I/O to mock in tests.
 */
export type LandingResolutionInput = {
  /** `null` when the user has no active membership anywhere (F-ID-03 §4.4 row 1). */
  workspaceType: "school" | "personal" | null
  /** Required whenever `workspaceType` is non-null; ignored otherwise. */
  role?: WorkspaceRole | null
  /**
   * F-ID-05 §8 Part 2's forced-onboarding redirect signal. Omitted entirely
   * by a caller that must never be overridden (e.g. `switchWorkspace`, an
   * explicit user-picked destination — F-ID-05 §2: "Be forced through
   * onboarding: never" once a membership exists). Grouped into one object,
   * not two independent optional fields, so "both together or neither" is a
   * type guarantee rather than a comment a future caller could ignore.
   */
  onboarding?: {
    /** `profiles.onboarding_completed_at`; `null` means "never completed." */
    onboardingCompletedAt: string | null
    /**
     * Whether the caller has at least one ACTIVE `type='school'` membership,
     * independent of which single workspace resolved as "active" this
     * session. `workspaceType` alone cannot answer this: every account has
     * exactly one personal workspace from registration (F-ID-05 §4.1) and it
     * resolves first when nothing else is active (F-ID-03 §4.3), so
     * `workspaceType === 'personal'` is true for both a genuinely
     * tutoring-only user and a brand-new user who has never seen the
     * chooser.
     */
    hasActiveSchoolMembership: boolean
  }
}

export const LANDING_ROUTES = {
  onboarding: "/onboarding",
  personal: "/personal",
  app: "/app",
  family: "/family",
} as const

export type LandingRoute = (typeof LANDING_ROUTES)[keyof typeof LANDING_ROUTES]

/**
 * `resolveLandingRoute` — F-ID-03 §4.4's table, verbatim, with one override
 * F-ID-05 §8 Part 2 adds ahead of it (checked first, below):
 *
 * | Condition (first match wins)                              | Route         |
 * | ------------------------------------------------------------------------ |
 * | onboarding never completed AND no school membership (F-ID-05) | /onboarding |
 * | No active membership at all                                | /onboarding  |
 * | Resolved workspace type='personal'                         | /personal    |
 * | type='school' and role in {owner,admin,teacher,staff}      | /app         |
 * | type='school' and role='parent'                             | /family     |
 *
 * The `/platform` row is intentionally not modelled here: platform admin is
 * never a default landing (F-ID-03 §4.4 footnote) — it is only ever reached by
 * explicit navigation, which is a routing concern, not a resolution one.
 *
 * Fails CLOSED on a school workspace with no resolved role: `/app` is the
 * staff shell, the widest data surface in the product, so it is reached by an
 * explicit allowlist match and never as a fallthrough default. A missing role
 * means resolution failed, and the answer to that is `/onboarding` — not the
 * staff dashboard.
 */
const SCHOOL_SHELL_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "admin",
  "teacher",
  "staff",
]

export function resolveLandingRoute(
  input: LandingResolutionInput
): LandingRoute {
  // F-ID-05 §8 Part 2: a verified user who has never finished onboarding
  // AND has no school membership yet is forced to /onboarding, even though
  // their personal workspace already resolves — see `onboarding`'s field
  // comment above for why a caller must provide both or neither.
  if (
    input.onboarding?.onboardingCompletedAt === null &&
    !input.onboarding.hasActiveSchoolMembership
  ) {
    return LANDING_ROUTES.onboarding
  }

  if (!input.workspaceType) return LANDING_ROUTES.onboarding
  if (input.workspaceType === "personal") return LANDING_ROUTES.personal

  // workspaceType === "school"
  if (input.role === "parent") return LANDING_ROUTES.family
  if (input.role && SCHOOL_SHELL_ROLES.includes(input.role)) {
    return LANDING_ROUTES.app
  }
  return LANDING_ROUTES.onboarding
}
