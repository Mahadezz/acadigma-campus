import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { isWorkspaceRole, type WorkspaceRole } from "@acadigma/domain"

import type { AcadigmaSupabaseClient } from "./client"

/** The header the client sets from its active-workspace cookie. */
export const WORKSPACE_HEADER = "x-workspace-id"

/**
 * Everything a repository call needs to know about who is asking.
 *
 * This object is *derived*, never received. The browser tells us which workspace it
 * thinks is active; the server decides whether that is true by querying
 * `workspace_members` (DECISION-LOG D-04 — the root cause of the Base44 security
 * review was trusting a client-writable field).
 */
export type WorkspaceContext = {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  /** Plan slug from the workspace's subscription; drives feature gating. */
  plan: string | null
}

/** Minimal header bag, so this works with `Headers`, middleware and plain objects. */
export type HeaderSource = { get: (name: string) => string | null }

/** The membership row we rely on, validated rather than assumed. */
const membershipRowSchema = z.object({
  role: z.string(),
  status: z.string(),
  workspaces: z
    .object({ plan: z.string().nullable().optional() })
    .nullable()
    .optional(),
})

const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "You do not have access to this workspace."
)

/**
 * Resolves and verifies the active workspace for a request.
 *
 * Fails closed at every step: no session, no header, a malformed header, no active
 * membership row, or a role we do not recognise all produce an error rather than a
 * partially-trusted context.
 */
export async function resolveWorkspaceContext(
  supabase: AcadigmaSupabaseClient,
  headers: HeaderSource
): Promise<Result<WorkspaceContext, ApiError>> {
  // getUser() re-validates the JWT with the auth server. getSession() only reads the
  // cookie, which a caller can forge, so it is never enough on the server.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const rawWorkspaceId = headers.get(WORKSPACE_HEADER)
  if (!rawWorkspaceId) {
    return err(
      apiError(
        "forbidden",
        "No workspace selected. Choose a workspace and try again."
      )
    )
  }

  const parsedWorkspaceId = z.string().uuid().safeParse(rawWorkspaceId)
  if (!parsedWorkspaceId.success) {
    // A malformed id is never a legitimate client; do not echo it back.
    return err(FORBIDDEN)
  }
  const workspaceId = parsedWorkspaceId.data

  // RLS restricts this select to the caller's own membership rows; the explicit
  // user_id filter keeps the intent readable and the query index-friendly.
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, status, workspaces(plan)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle()

  if (error) {
    return err(
      apiError(
        "dependency_unavailable",
        "Could not verify your workspace access."
      )
    )
  }
  if (!data) return err(FORBIDDEN)

  const membership = membershipRowSchema.safeParse(data)
  if (!membership.success || !isWorkspaceRole(membership.data.role)) {
    return err(FORBIDDEN)
  }

  return ok({
    workspaceId,
    userId: userData.user.id,
    role: membership.data.role,
    plan: membership.data.workspaces?.plan ?? null,
  })
}

/**
 * True when the signed-in user is Acadigma platform staff (DECISION-LOG D-16).
 * Read from `profiles`, which only the platform console can write.
 */
export async function isPlatformAdmin(
  supabase: AcadigmaSupabaseClient
): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userData.user.id)
    .maybeSingle()

  if (error || !data) return false
  return data["is_platform_admin"] === true
}
