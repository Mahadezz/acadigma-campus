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

  let body: SessionCheck
  if (result.ok) {
    body = {
      kind: "signed_in",
      userId: result.data.userId,
      workspaceId: result.data.workspaceId,
      role: result.data.role,
    }
  } else if (result.error.reason === "unauthenticated") {
    body = { kind: "signed_out" }
  } else if (result.error.reason === "dependency_unavailable") {
    // Not a verdict: the client keeps its cache and asks again later.
    return NextResponse.json(
      { kind: "unknown" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  } else {
    // Signed in, but no active membership here (removed, suspended, none).
    const { data } = await supabase.auth.getUser()
    body = data.user
      ? {
          kind: "signed_in",
          userId: data.user.id,
          workspaceId: null,
          role: null,
        }
      : { kind: "signed_out" }
  }

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
