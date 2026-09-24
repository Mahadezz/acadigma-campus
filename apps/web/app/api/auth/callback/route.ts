import { NextResponse, type NextRequest } from "next/server"

import { authCallbackQuerySchema } from "@acadigma/contracts"
import { safeReturnTo } from "@acadigma/domain/auth"

import { logAuthEvent } from "@/lib/audit"
import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie"

/**
 * F-ID-01 §7: `GET /api/auth/callback` — query `{token_hash, type, next}`. The
 * `emailRedirectTo` for `signUp` points here (Part 2 §4.1 step 6). Password
 * reset does NOT come through here — §4.5 sends `/reset?token_hash=...` directly
 * so `resetPassword` can verify + set the password in one server action.
 *
 * AC16: a crafted `next` never leaves the origin; `safeReturnTo` logs the
 * rejection and the redirect falls back to the resolved landing route.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const parsed = authCallbackQuerySchema.safeParse({
    tokenHash: url.searchParams.get("token_hash") ?? "",
    type: url.searchParams.get("type") ?? "",
    next: url.searchParams.get("next") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL("/login?error=link_expired", url.origin)
    )
  }

  const { tokenHash, type, next } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  })

  if (error || !data.user) {
    const log = await requestLogger({ route: "auth.callback" })
    log.warn({ type, status: error?.status }, "auth callback token rejected")
    const fallback =
      type === "recovery"
        ? "/reset?error=link_expired"
        : "/login?error=link_expired"
    return NextResponse.redirect(new URL(fallback, url.origin))
  }

  // `verifyOtp` above just minted a live session, possibly for a different person
  // than whoever last used this device (shared-phone scenario, F-ID-03 review): a
  // stale `acadigma_workspace` cookie left by an earlier session must not survive
  // into this one, or the next request mirrors it into `x-workspace-id`,
  // `resolveWorkspaceContext` re-verifies it against the WRONG person and either
  // 403s them or fires a false `tenancy.context_rejected` tripwire against
  // whoever's workspace that id belonged to. Cleared on every branch below.
  function clearStaleWorkspaceCookie(response: NextResponse): NextResponse {
    response.cookies.delete(WORKSPACE_COOKIE)
    return response
  }

  if (type === "recovery") {
    // The recovery session is now active; /reset itself calls updateUser().
    return clearStaleWorkspaceCookie(
      NextResponse.redirect(new URL("/reset", url.origin))
    )
  }

  await logAuthEvent(supabase, {
    action: "account.email_verified",
    rowId: data.user.id,
  })

  const destination = safeReturnTo(next, "/onboarding")
  if (destination.rejected) {
    const log = await requestLogger({ route: "auth.callback" })
    log.warn({ next }, "rejected an off-origin next parameter (AC16)")
  }

  return clearStaleWorkspaceCookie(
    NextResponse.redirect(new URL(destination.path, url.origin))
  )
}
