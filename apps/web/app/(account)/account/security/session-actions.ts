"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import {
  apiError,
  apiErrorFromZod,
  err,
  ok,
  revokeSessionInputSchema,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { revokeMySession } from "@acadigma/db/repositories/sessions"

import { logAuthEvent } from "@/lib/audit"
import { createClient } from "@/lib/supabase/server"
import { TEXT_SIZE_COOKIE, UI_MODE_COOKIE } from "@/lib/ui-preferences"
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie"

/**
 * F-ID-01 Part 6 (§4.8, D-116). Self-service: the "policy" step is "your own
 * sessions", which the database enforces by acting on auth.uid() only.
 */
export async function revokeSession(
  raw: unknown
): Promise<Result<{ revoked: boolean }, ApiError>> {
  const parsed = revokeSessionInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const result = await revokeMySession(supabase, parsed.data.sessionId)
  if (result.ok) revalidatePath("/account/security")
  return result
}

/** §4.8 "Sign out everywhere": every session, this one included (D-116 §4).
 * Returns instead of redirecting so the client can clear this device's
 * offline data first, as the delete-account flow does. */
export async function signOutEverywhere(): Promise<
  Result<{ signedOut: true }, ApiError>
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  // Logged first: after a global sign-out there is no session to log with.
  await logAuthEvent(supabase, {
    action: "session.revoked_all",
    rowId: user.id,
  })
  const { error } = await supabase.auth.signOut({ scope: "global" })
  if (error) {
    return err(
      apiError(
        "dependency_unavailable",
        "Could not sign out your devices. Try again."
      )
    )
  }

  // Same cookie hygiene as signOut() (§4.10).
  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_COOKIE)
  cookieStore.delete(UI_MODE_COOKIE)
  cookieStore.delete(TEXT_SIZE_COOKIE)

  return ok({ signedOut: true })
}
