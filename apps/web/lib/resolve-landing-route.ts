import "server-only"

import {
  resolveWorkspaceContext,
  type AcadigmaSupabaseClient,
} from "@acadigma/db"
import { resolveLandingRoute as resolveLandingRouteForContext } from "@acadigma/domain/workspace"

import { createClient } from "@/lib/supabase/server"

/**
 * F-ID-03 §4.4 full implementation, replacing F-ID-01 Part 3's
 * `resolveLandingRoute()` stub (which always returned `/onboarding`).
 *
 * Reuses `resolveWorkspaceContext` (packages/db) rather than re-implementing
 * its resolution order, but — F-ID-03 review follow-up — deliberately hands it
 * an EMPTY header bag rather than this request's real headers.
 *
 * The original assumption here ("there is no x-workspace-id header yet, right
 * after sign-in") is false on a shared device: middleware mirrors whatever
 * `acadigma_workspace` cookie is already on the browser into `x-workspace-id`
 * for every request, including this one, BEFORE this handler runs — and that
 * cookie can belong to whoever was last signed in on this device, not the
 * person `getUser()` now resolves to (session A expires without sign-out,
 * person B signs in on the same phone). `signInWithPassword`/`resetPassword`
 * clear that cookie on the RESPONSE as soon as a new session is minted, but a
 * response header cannot retroactively change the headers Next already
 * attached to the request that is executing right now — so this function, the
 * one place a fresh sign-in decides where to land, must not trust the header
 * either way. Trusting it would resolve workspace context for person A's
 * tenant against person B's session: a 403 that fires a false
 * `tenancy.context_rejected` "forgery" tripwire into person A's school, and
 * strands person B on `/onboarding` instead of their real landing route
 * (`profiles.last_active_workspace_id` → first active membership).
 *
 * Pure routing decision lives in `packages/domain/workspace/resolveLanding.ts`;
 * this file's only job is the DB round trip(s) that feed it. `supabaseOverride`
 * exists so a caller that already has a client for this request (e.g. the login
 * action, mid sign-in) does not pay for a second one.
 *
 * F-ID-05 §8 Part 2 addendum (Opus review, PR #24): on a successful workspace
 * resolution this also reads `profiles.onboarding_completed_at` and probes for
 * any ACTIVE `type='school'` membership (via the `list_my_workspaces` RPC —
 * already `getOnboardingState`'s source of truth), feeding both into the pure
 * domain function's forced-onboarding override. `workspaceType` alone cannot
 * distinguish a genuine tutoring-only user from a brand-new one who has never
 * seen the chooser: every account gets exactly one personal workspace at
 * registration (F-ID-05 §4.1), and it resolves first whenever nothing else is
 * active (F-ID-03 §4.3) — so `workspaceType === 'personal'` is true for both.
 */
export async function resolveLandingRoute(
  supabaseOverride?: AcadigmaSupabaseClient
): Promise<string> {
  const supabase = supabaseOverride ?? (await createClient())

  const result = await resolveWorkspaceContext(supabase, new Headers())

  if (!result.ok) {
    // Every failure reason this function can actually observe post-login
    // (no header, so never "not_a_member"/"malformed_workspace_id") means
    // "we could not resolve a workspace for this person" — send them to
    // onboarding rather than surface an error on their first screen.
    return "/onboarding"
  }

  const [{ data: profile }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", result.data.userId)
      .maybeSingle(),
    supabase.rpc("list_my_workspaces"),
  ])

  return resolveLandingRouteForContext({
    workspaceType: result.data.workspaceType,
    role: result.data.role,
    onboardingCompletedAt:
      (profile as { onboarding_completed_at?: string | null } | null)
        ?.onboarding_completed_at ?? null,
    // If `resolveWorkspaceContext` itself already resolved a `school`
    // workspace, that alone proves an active school membership exists —
    // OR'd in ahead of the RPC probe so a transient `list_my_workspaces`
    // failure can never force an already-resolved school member back to
    // `/onboarding` (fails closed toward "let them in", not toward
    // "show the chooser to someone who plainly already has a school").
    hasActiveSchoolMembership:
      result.data.workspaceType === "school" ||
      hasActiveSchoolMembershipRow(membershipRows),
  })
}

/**
 * Fails CLOSED to `false` (never falls back to "assume they have a school")
 * on a malformed or errored RPC response — the worst case is showing the
 * chooser again to someone who already has a school, not the reverse.
 */
function hasActiveSchoolMembershipRow(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false
  return rows.some(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      (row as Record<string, unknown>)["type"] === "school" &&
      (row as Record<string, unknown>)["status"] === "active"
  )
}
