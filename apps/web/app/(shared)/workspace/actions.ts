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
  updateUiPreferencesInputSchema,
  type ApiError,
  type ListMyWorkspacesOutput,
  type Result,
  type SwitchWorkspaceOutput,
  type UiPreferences,
} from "@acadigma/contracts"
import { upsertUiPreferences } from "@acadigma/db/repositories/ui-preferences"
import { resolveLandingRoute } from "@acadigma/domain/workspace"

import { isLocale, type Locale } from "@/lib/locale"
import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import {
  TEXT_SIZE_COOKIE,
  UI_MODE_COOKIE,
  UI_PREFS_COOKIE_OPTS,
} from "@/lib/ui-preferences"
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
    // public.switch_workspace raises these messages by name (§7) so the
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
    // Every other non-active status: today `archived`, tomorrow whatever the
    // enum grows. The RPC allowlists `active` rather than denylisting the
    // values it happens to know about, so this branch stays correct as the
    // enum changes.
    if (error.message === "WORKSPACE_UNAVAILABLE") {
      return err(
        apiError("forbidden", "This workspace is no longer available.")
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

/**
 * D-401: persists the `UserMenu`'s language switch to `profiles.locale`, in
 * addition to the `acadigma_locale` cookie the client already wrote — the
 * cookie makes the switch instant on this device, this makes it follow the
 * user to their next device (`getLocale()`, `lib/i18n.ts`, falls back to
 * `profiles.locale` when a device has no cookie yet). Not gated by
 * `requireWritable`: `profiles` carries no `workspace_id`, a language
 * preference is not a tenant write, and RLS (`profiles_update_self`) already
 * limits this to the caller's own row.
 */
export async function updateLocale(
  locale: string
): Promise<Result<{ locale: Locale }, ApiError>> {
  if (!isLocale(locale)) {
    return err(apiError("validation_failed", "Unsupported language."))
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const { error } = await supabase
    .from("profiles")
    .update({ locale })
    .eq("id", user.id)

  if (error) {
    const log = await requestLogger({ route: "profile.update_locale" })
    log.warn({ code: error.code }, "profiles.locale update failed")
    return err(
      apiError(
        "dependency_unavailable",
        "Could not save your language preference."
      )
    )
  }

  return ok({ locale })
}

/**
 * F-ID-10 §7 `updateUiPreferences` (D-403, D-404): `/app/settings/display`'s
 * text-size radio and basic-mode switch, and `UserMenu`'s "Switch to basic
 * mode" item, all call this. Same shape as `updateLocale` above and for the
 * same reason: `user_preferences` carries no `workspace_id` (DATA-MODEL.md
 * §1.7), so there is no tenant context to resolve and no `requireWritable`
 * gate — this is never a tenant write. Unlike `updateLocale`'s bare string,
 * `parsed.data` is a genuine partial patch (`{uiMode?, textSize?}`), so the
 * repository's `upsertUiPreferences` only writes the keys the caller sent.
 *
 * Cookie mirrors are written HERE, server-side, non-httpOnly (§3) — every
 * request's `getUiPreferences()` (`lib/ui-preferences.ts`) reads them before
 * touching the database, which is what makes the very next server render
 * carry the new value with no flash. `revalidatePath("/", "layout")` forces
 * that render to actually happen without a full page reload, the same
 * pattern `switchWorkspace` above uses for the workspace cookie.
 */
export async function updateUiPreferences(
  input: unknown
): Promise<Result<UiPreferences, ApiError>> {
  const parsed = updateUiPreferencesInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const result = await upsertUiPreferences(supabase, user.id, parsed.data)
  if (!result.ok) return result

  const cookieStore = await cookies()
  cookieStore.set(UI_MODE_COOKIE, result.data.uiMode, UI_PREFS_COOKIE_OPTS)
  cookieStore.set(TEXT_SIZE_COOKIE, result.data.textSize, UI_PREFS_COOKIE_OPTS)

  revalidatePath("/", "layout")

  return ok(result.data)
}
