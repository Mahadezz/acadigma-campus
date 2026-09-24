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
 * this file's only job is the one DB round trip that feeds it. `supabaseOverride`
 * exists so a caller that already has a client for this request (e.g. the login
 * action, mid sign-in) does not pay for a second one.
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

  return resolveLandingRouteForContext({
    workspaceType: result.data.workspaceType,
    role: result.data.role,
  })
}
