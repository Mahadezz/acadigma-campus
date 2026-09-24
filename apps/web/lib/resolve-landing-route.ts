import "server-only"

import { headers } from "next/headers"

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
 * its resolution order: at the one call site today (right after sign-in, in
 * `app/(auth)/actions.ts`), there is no `x-workspace-id` header yet, so this
 * naturally falls through to `profiles.last_active_workspace_id` and then the
 * first active membership (personal first) — exactly F-ID-03 §4.3 steps 2-3.
 * "No active membership at all" (§4.4 row 1) is real here specifically
 * because it is the only caller that can observe it: every other caller sits
 * behind `requireWorkspace()`, which turns that same case into a 403 instead.
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
  const requestHeaders = await headers()

  const result = await resolveWorkspaceContext(supabase, requestHeaders)

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
