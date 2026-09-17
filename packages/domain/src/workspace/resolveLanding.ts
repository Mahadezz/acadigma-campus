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
}

export const LANDING_ROUTES = {
  onboarding: "/onboarding",
  personal: "/personal",
  app: "/app",
  family: "/family",
} as const

export type LandingRoute = (typeof LANDING_ROUTES)[keyof typeof LANDING_ROUTES]

/**
 * `resolveLandingRoute` — F-ID-03 §4.4's table, verbatim:
 *
 * | Condition (first match wins)                              | Route         |
 * | ------------------------------------------------------------------------ |
 * | No active membership at all                                | /onboarding  |
 * | Resolved workspace type='personal'                         | /personal    |
 * | type='school' and role in {owner,admin,teacher,staff}      | /app         |
 * | type='school' and role='parent'                             | /family     |
 *
 * The `/platform` row is intentionally not modelled here: platform admin is
 * never a default landing (F-ID-03 §4.4 footnote) — it is only ever reached by
 * explicit navigation, which is a routing concern, not a resolution one.
 */
export function resolveLandingRoute(
  input: LandingResolutionInput
): LandingRoute {
  if (!input.workspaceType) return LANDING_ROUTES.onboarding
  if (input.workspaceType === "personal") return LANDING_ROUTES.personal

  // workspaceType === "school"
  if (input.role === "parent") return LANDING_ROUTES.family
  return LANDING_ROUTES.app
}
