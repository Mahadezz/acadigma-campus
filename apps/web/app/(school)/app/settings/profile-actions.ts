"use server"

/**
 * F-OP-07 Part 1 — `updateSchoolProfile` / `updateBranding` (§7). Kept apart
 * from `actions.ts` (the M0 policy-blob actions) so parallel lanes editing
 * that file do not collide.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  planReadOnlyApiError,
  updateBrandingInputSchema,
  updateSchoolProfileInputSchema,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { requireWritable, type WorkspaceContext } from "@acadigma/db"
import {
  updateSchoolProfile as updateSchoolProfileRepo,
  type SchoolProfile,
} from "@acadigma/db/repositories/settings"
import { can, type Action } from "@acadigma/domain"
import { unknownHeaderTokens } from "@acadigma/domain/settings"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const SETTINGS_PATH = "/app/settings"

// ---------------------------------------------------------------------------
// F-OP-07 Part 1 — `updateSchoolProfile` / `updateBranding` (§7). Owner/admin
// only (`workspace.settings.write` / `workspace.branding.write`), refused in
// read-only mode (`requireWritable`, D-29), and re-refused by the
// `school_profiles_update` RLS policy if this check were ever bypassed.
// ---------------------------------------------------------------------------

type WriteGate = Result<
  { ctx: WorkspaceContext; supabase: Awaited<ReturnType<typeof createClient>> },
  ApiError
>

async function gateWrite(permission: Action): Promise<WriteGate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, permission)) {
    return err(
      apiError(
        "forbidden",
        "Only an owner or admin can change school settings."
      )
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

export async function updateSchoolProfile(
  input: unknown
): Promise<Result<SchoolProfile, ApiError>> {
  const parsed = updateSchoolProfileInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("workspace.settings.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await updateSchoolProfileRepo(supabase, ctx, parsed.data)
  if (result.ok) revalidatePath(SETTINGS_PATH, "layout")
  return result
}

export async function updateBranding(
  input: unknown
): Promise<Result<SchoolProfile, ApiError>> {
  const parsed = updateBrandingInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  // §3.5: an unknown {token} would print as blank on every PDF — refuse it here.
  const fieldErrors: Record<string, string[]> = {}
  for (const key of ["header_line_1", "header_line_2"] as const) {
    const unknown = unknownHeaderTokens(parsed.data.branding[key] ?? "")
    if (unknown.length > 0) {
      fieldErrors[key] = [
        `Unknown token: ${unknown.map((t) => `{${t}}`).join(", ")}`,
      ]
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return err(
      apiError("validation_failed", "Some header tokens are not recognised.", {
        fieldErrors,
      })
    )
  }

  const gate = await gateWrite("workspace.branding.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await updateSchoolProfileRepo(supabase, ctx, {
    version: parsed.data.version,
    branding: parsed.data.branding,
  })
  if (result.ok) revalidatePath(SETTINGS_PATH, "layout")
  return result
}
