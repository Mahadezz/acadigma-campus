"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { z } from "zod"

import {
  apiError,
  apiErrorFromZod,
  err,
  ok,
  switchWorkspaceInputSchema,
  listMyWorkspacesOutputSchema,
  type ApiError,
  type ListMyWorkspacesOutput,
  type Result,
  type SwitchWorkspaceOutput,
} from "@acadigma/contracts"
import { resolveLandingRoute } from "@acadigma/domain/workspace"

import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

/**
 * F-ID-03 §7 `switchWorkspace` / `listMyWorkspaces`. Five-step shape (HANDBOOK
 * §8): parse -> resolve context (there is no WorkspaceContext yet — that is
 * the point of these two actions) -> the `public.switch_workspace` /
 * `public.list_my_workspaces` RPCs ARE the policy + repository step (D-50:
 * they re-verify membership server-side, the same rule `resolveWorkspaceContext`
 * enforces for every other request) -> revalidate + return the canonical Result.
 */

const switchWorkspaceRpcRowSchema = z.object({
  workspace_type: z.enum(["school", "personal"]),
  role: z.enum(["owner", "admin", "teacher", "staff", "parent"]),
  plan_id: z.string().uuid().nullable(),
})

export async function switchWorkspace(
  input: unknown
): Promise<Result<SwitchWorkspaceOutput, ApiError>> {
  const parsed = switchWorkspaceInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const { data, error } = await supabase.rpc("switch_workspace", {
    p_workspace_id: parsed.data.workspaceId,
  })

  const log = await requestLogger({ route: "workspace.switch" })

  if (error) {
    // public.switch_workspace raises these two messages by name (§7) so the
    // client can branch without parsing SQLSTATE.
    if (error.message === "WORKSPACE_NOT_MEMBER") {
      return err(
        apiError("forbidden", "You no longer have access to that workspace.")
      )
    }
    if (error.message === "WORKSPACE_SUSPENDED") {
      return err(
        apiError(
          "forbidden",
          "This workspace is suspended. Contact your school for details."
        )
      )
    }
    log.warn({ code: error.code }, "switch_workspace RPC failed")
    return err(
      apiError(
        "dependency_unavailable",
        "Could not switch workspaces. Try again."
      )
    )
  }

  const rawRow = Array.isArray(data) ? data[0] : data
  const row = switchWorkspaceRpcRowSchema.safeParse(rawRow)
  if (!row.success) {
    log.error(
      { issues: row.error.issues },
      "switch_workspace returned an unexpected shape"
    )
    return err(apiError("internal", "Could not switch workspaces."))
  }

  const landingRoute = resolveLandingRoute({
    workspaceType: row.data.workspace_type,
    role: row.data.role,
  })

  // httpOnly: the switcher writes it server-side only; middleware.ts mirrors
  // it into x-workspace-id on every subsequent request (ARCHITECTURE §3).
  const cookieStore = await cookies()
  cookieStore.set(WORKSPACE_COOKIE, parsed.data.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })

  // Every shell reads the workspace from context derived server-side; the
  // whole tree needs to re-render against the new tenant (F-ID-03 §4.2).
  revalidatePath("/", "layout")

  return ok({ landingRoute, workspaceType: row.data.workspace_type })
}

const listMyWorkspacesRpcRowSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["school", "personal"]),
  role: z.enum(["owner", "admin", "teacher", "staff", "parent"]),
  status: z.enum(["pending", "active", "removed"]),
  logo_url: z.string().nullable(),
})

export async function listMyWorkspaces(): Promise<
  Result<ListMyWorkspacesOutput, ApiError>
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const { data, error } = await supabase.rpc("list_my_workspaces")
  if (error) {
    const log = await requestLogger({ route: "workspace.list" })
    log.warn({ code: error.code }, "list_my_workspaces RPC failed")
    return err(
      apiError("dependency_unavailable", "Could not load your workspaces.")
    )
  }

  const rows = z.array(listMyWorkspacesRpcRowSchema).safeParse(data ?? [])
  if (!rows.success) {
    return err(apiError("internal", "Could not load your workspaces."))
  }

  const result = listMyWorkspacesOutputSchema.safeParse(
    rows.data.map((r) => ({
      workspaceId: r.workspace_id,
      name: r.name,
      type: r.type,
      role: r.role,
      status: r.status,
      logoUrl: r.logo_url,
    }))
  )
  if (!result.success) {
    return err(apiError("internal", "Could not load your workspaces."))
  }

  return ok(result.data)
}
