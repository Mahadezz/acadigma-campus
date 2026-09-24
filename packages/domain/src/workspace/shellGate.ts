import {
  LANDING_ROUTES,
  resolveLandingRoute,
  type LandingResolutionInput,
  type LandingRoute,
} from "./resolveLanding"

/**
 * F-ID-03 §8 Part 4 / ROADMAP M1 1.1: the gate every workspace-scoped shell
 * layout runs right after `requireWorkspace()` resolves an active
 * membership. Today `(school)/app/layout.tsx` picked its nav tree purely
 * from `getNavConfig(ctx.workspaceType, ctx.role)` with no check that the
 * resolved context actually belongs to this shell — a `parent` role or a
 * `personal` workspace would render the `family:parent`/`personal:owner`
 * curated trees, whose `/family/*`/`/personal/*` hrefs 404 (PR #17 review,
 * `docs/plan/HANDOFF-2026-09-24.md` item 3).
 *
 * Deliberately reuses `resolveLandingRoute` — the single source of truth for
 * "which shell does this workspaceType ∧ role belong to" (F-ID-03 §4.4) —
 * rather than re-deriving the table a second time, so a shell's gate can
 * never drift from the landing resolver. Only `workspaceType`/`role` are
 * accepted (not the full `LandingResolutionInput`): a request already inside
 * a shell has, by construction, an active membership (`requireWorkspace()`
 * would have already 403'd otherwise), so the forced-onboarding override
 * F-ID-05 Part 2 adds to `resolveLandingRoute` must never fire here — same
 * convention `switchWorkspace` already uses (it also omits those fields).
 */
export type ShellName = "school" | "personal" | "family"

export type ShellGateDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: LandingRoute }
  | { kind: "forbidden" }

const SHELL_ROUTES: Record<ShellName, LandingRoute> = {
  school: LANDING_ROUTES.app,
  personal: LANDING_ROUTES.personal,
  family: LANDING_ROUTES.family,
}

export function resolveShellGate(
  shell: ShellName,
  input: Pick<LandingResolutionInput, "workspaceType" | "role">
): ShellGateDecision {
  const canonical = resolveLandingRoute(input)

  if (canonical === SHELL_ROUTES[shell]) return { kind: "allow" }

  // Unreachable once `requireWorkspace()` has already proven an active
  // membership (onboarding only fires for `workspaceType: null` or a school
  // membership with no role) — fail closed rather than loop a caller who
  // plainly already has a membership back into onboarding.
  if (canonical === LANDING_ROUTES.onboarding) return { kind: "forbidden" }

  return { kind: "redirect", to: canonical }
}
