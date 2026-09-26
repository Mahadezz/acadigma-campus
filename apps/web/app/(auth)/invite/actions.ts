"use server"

/**
 * F-AC-02 Part 4 (D-108) — the parent's side of a guardian link. The token
 * travels in the URL fragment and reaches the server only in these POST
 * bodies (F-ID-04 §4.2), never in a request line or a log.
 */

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import {
  apiError,
  err,
  guardianInviteTokenInputSchema,
  ok,
  type ApiError,
  type GuardianInvitationPreview,
  type Result,
} from "@acadigma/contracts"
import {
  acceptGuardianInvitation as acceptRow,
  previewGuardianInvitation as previewRow,
} from "@acadigma/db"

import { createClient } from "@/lib/supabase/server"
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie"

const BAD_LINK = apiError("not_found", "This invitation link is not valid.", {
  fieldErrors: { _root: ["INVITATION_NOT_FOUND"] },
})

export async function previewInvitation(
  input: unknown
): Promise<Result<GuardianInvitationPreview, ApiError>> {
  const parsed = guardianInviteTokenInputSchema.safeParse(input)
  if (!parsed.success) return err(BAD_LINK)
  return previewRow(await createClient(), parsed.data.token)
}

/** Accepts, then makes the school the active workspace so `/family` opens it. */
export async function acceptInvitation(
  input: unknown
): Promise<Result<null, ApiError>> {
  const parsed = guardianInviteTokenInputSchema.safeParse(input)
  if (!parsed.success) return err(BAD_LINK)
  const accepted = await acceptRow(await createClient(), parsed.data.token)
  if (!accepted.ok) return accepted

  const cookieStore = await cookies()
  cookieStore.set(WORKSPACE_COOKIE, accepted.data.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath("/", "layout")
  return ok(null)
}
