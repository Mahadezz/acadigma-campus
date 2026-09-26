import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { resolveWorkspaceContext } from "@acadigma/db"

import type { SessionCheck } from "@/lib/offline/purge"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * F-ID-11 §4.8 (Part 1, D-308): who is signed in on this device, in which
 * workspace, with which role — the three things the offline cache purge
 * compares against what it saw last time (`lib/offline/check.ts`).
 *
 * Answers only about the caller's own session and active membership, which
 * the shell already shows them; `resolveWorkspaceContext` re-validates the JWT
 * and the membership, so a revoked session or a removed member reads as such.
 */
export async function GET() {
  const supabase = await createClient()
  const result = await resolveWorkspaceContext(supabase, await headers())

  // Not a verdict: the client keeps its cache and asks again later.
  const unknown = () =>
    NextResponse.json(
      { kind: "unknown" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )

  let body: SessionCheck
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
    body = {
      kind: "signed_in",
      userId: result.data.userId,
      workspaceId: result.data.workspaceId,
      role: result.data.role,
      scope: ids.length > 0 ? ids.join(",") : null,
    }
  } else if (result.error.reason === "unauthenticated") {
    body = { kind: "signed_out" }
  } else if (result.error.reason === "dependency_unavailable") {
    return unknown()
  } else {
    // Signed in, but no active membership here (removed, suspended, none).
    const { data } = await supabase.auth.getUser()
    body = data.user
      ? {
          kind: "signed_in",
          userId: data.user.id,
          workspaceId: null,
          role: null,
          scope: null,
        }
      : { kind: "signed_out" }
  }

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
