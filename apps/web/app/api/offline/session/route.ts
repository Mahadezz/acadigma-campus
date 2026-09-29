import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { resolveWorkspaceContext } from "@acadigma/db"

import type { OfflineSnapshot, SessionCheck } from "@/lib/offline/purge"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * F-ID-11 §4.8 (D-308, D-309): who is signed in on this device, in which
 * workspace, with which role — what the offline cache purge compares against
 * what it saw last time (`lib/offline/check.ts`) — plus every workspace the
 * user is still an active member of, which the outbox purge keeps.
 *
 * Answers only about the caller's own session and memberships, which the
 * shell already shows them; `resolveWorkspaceContext` re-validates the JWT
 * and the membership, so a revoked session or a removed member reads as such.
 */
export async function GET() {
  const supabase = await createClient()
  const result = await resolveWorkspaceContext(supabase, await headers())
  const reply = (body: SessionCheck, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    })
  // Not a verdict: the client keeps its cache and asks again later.
  const unknown = () => reply({ kind: "unknown" }, 503)

  let snapshot: OfflineSnapshot
  if (result.ok) {
    // The students this user sees as a guardian here: a revoked link must
    // wipe the /family pages although membership and role stay (#85 review).
    const links = await supabase
      .from("guardian_users")
      .select("student_id")
      .eq("workspace_id", result.data.workspaceId)
      .eq("user_id", result.data.userId)
      .eq("status", "active")
    if (links.error) return unknown()
    const ids = (links.data ?? []).map((l) => l.student_id).sort()
    snapshot = {
      userId: result.data.userId,
      workspaceId: result.data.workspaceId,
      role: result.data.role,
      scope: ids.length > 0 ? ids.join(",") : null,
    }
  } else if (result.error.reason === "unauthenticated") {
    // D-310, §4.8: a deleted or banned account (Auth says so about this
    // device's token) can never send its queue — unlike an expired session,
    // whose queue waits for the same user (§4.6). The id is the cookie's own
    // (unverified) user: it only names which queue on THIS device to delete.
    const { error } = await supabase.auth.getUser()
    if (error?.code === "user_not_found" || error?.code === "user_banned") {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (userId) return reply({ kind: "revoked", userId })
    }
    return reply({ kind: "signed_out" })
  } else if (result.error.reason === "dependency_unavailable") {
    return unknown()
  } else {
    // Signed in, but no active membership here (removed, suspended, none).
    const { data } = await supabase.auth.getUser()
    if (!data.user) return reply({ kind: "signed_out" })
    snapshot = {
      userId: data.user.id,
      workspaceId: null,
      role: null,
      scope: null,
    }
  }

  // §4.8, the outbox half: queued work for any other workspace is purged.
  const members = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", snapshot.userId)
    .eq("status", "active")
  if (members.error) return unknown()
  return reply({
    kind: "signed_in",
    ...snapshot,
    activeWorkspaceIds: (members.data ?? []).map((m) => m.workspace_id),
  })
}
