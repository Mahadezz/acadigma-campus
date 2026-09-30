import "server-only"

import { cache } from "react"

import { getPendingAccountDeletion } from "@acadigma/db/repositories/account-deletion"

import { createClient } from "@/lib/supabase/server"

/** Set by `requestAccountDeletion` right before every session ends, read by
 * /login to say when the account goes (D-113). httpOnly, so a crafted link
 * cannot make /login claim a deletion that was never asked for. */
export const DELETION_NOTICE_COOKIE = "acadigma_deletion_notice"
export const DELETION_NOTICE_COOKIE_OPTS = {
  path: "/login",
  maxAge: 60 * 10,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}

/** One read per request, shared by the shell's banner and the account page. */
export const getPendingDeletion = cache(async (userId: string) =>
  getPendingAccountDeletion(await createClient(), userId)
)
