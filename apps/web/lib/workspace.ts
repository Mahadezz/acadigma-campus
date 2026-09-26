import "server-only"

import { headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"

import {
  WORKSPACE_HEADER,
  resolveWorkspaceContext,
  type WorkspaceContext,
} from "@acadigma/db"
import { hasGuardianLink } from "@acadigma/db/repositories/results"
import { resolveShellGate, type ShellName } from "@acadigma/domain/workspace"

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

/**
 * `requireWorkspace()` plus the shell gate (`resolveShellGate`, F-ID-03 §8
 * Part 4), in one call.
 *
 * Convention: every PAGE and LAYOUT under a workspace-scoped shell —
 * `(school)/app`, `(personal)/personal`, `(family)/family` — calls this, never
 * `requireWorkspace()` directly. A layout only re-renders on a full navigation;
 * Next's client-side router can reach a page under it (via a cached
 * Router-State-Tree or a crafted request) without the layout re-running, so the
 * gate must also run at the page itself or a mismatched `workspaceType`/`role`
 * could render a shell it does not belong to (PR #30 review). `requireWorkspace()`
 * is still the right call outside a shell (server actions, `(account)`, `/sell`).
 */
export async function requireShell(
  shell: ShellName
): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace()

  const gate = resolveShellGate(shell, {
    workspaceType: ctx.workspaceType,
    role: ctx.role,
  })
  if (gate.kind === "redirect") {
    // D-109: a staff member who is also a parent at this school opens the
    // family shell for their own children — an active guardian link here,
    // not the role, is what lets them in.
    if (
      shell === "family" &&
      ctx.workspaceType === "school" &&
      (await isGuardianHere(ctx))
    ) {
      return ctx
    }
    redirect(gate.to)
  }
  if (gate.kind === "forbidden") forbidden()

  return ctx
}

/** True when the caller has an active guardian link in this school (D-109). */
export async function isGuardianHere(ctx: WorkspaceContext): Promise<boolean> {
  const linked = await hasGuardianLink(ctx, await createClient())
  return linked.ok && linked.data
}
