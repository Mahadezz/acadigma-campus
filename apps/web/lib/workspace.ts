import "server-only"

import { headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"

import {
  WORKSPACE_HEADER,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "@acadigma/db"

import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

/** Cookie the workspace switcher writes; middleware mirrors it into the header. */
export const WORKSPACE_COOKIE = "acadigma_workspace"

export { WORKSPACE_HEADER }

/**
 * Resolves the active workspace for the current request, or stops rendering.
 *
 * Signed out redirects to `/login`. Signed in without an active membership calls
 * Next's `forbidden()`, which renders `forbidden.tsx` with a real HTTP 403 — not a
 * 200 page that says "forbidden", and not a redirect loop through a workspace picker
 * this user also cannot use.
 *
 * The membership check itself lives in `packages/db` and queries `workspace_members`
 * (DECISION-LOG D-04). Nothing here trusts the header it was handed.
 */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const supabase = await createClient()
  const requestHeaders = await headers()

  const result = await resolveWorkspaceContext(supabase, requestHeaders)
  if (result.ok) return result.data

  if (result.error.code === "unauthenticated") redirect("/login")

  const log = await requestLogger({ route: "workspace.resolve" })
  log.warn({ code: result.error.code }, "workspace access denied")
  forbidden()
}
