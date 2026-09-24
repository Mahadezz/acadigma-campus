"use server"

/**
 * F-OP-07 §7 `getSchoolSettings` / `updateSchoolSettings` — Part 1 slice: read the
 * resolved settings and patch the five jsonb policy blobs. The rest of Part 1's
 * server contracts (branding preview, logo upload, calendar, modules, danger zone)
 * are out of scope here; see docs/test-reports/2026-09-17-M0-gates.md.
 *
 * Shape follows CLAUDE.md's non-negotiable rule 5: parse -> resolve context ->
 * policy check -> domain + repository -> revalidate -> return Result<T, ApiError>.
 * `updateSchoolSettings`'s write is audited for free by the `app.attach_audit`
 * trigger already on `school_profiles` (packages/db/src/repositories/settings.ts).
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  schoolSettingsPatchSchema,
  updateBrandingInputSchema,
  updateSchoolProfileInputSchema,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { requireWritable, type WorkspaceContext } from "@acadigma/db"
import {
  getSchoolSettings as getSchoolSettingsRepo,
  updateSchoolProfile as updateSchoolProfileRepo,
  updateSchoolSettings as updateSchoolSettingsRepo,
  type SchoolProfile,
} from "@acadigma/db/repositories/settings"
import { can, type Action } from "@acadigma/domain"
import {
  unknownHeaderTokens,
  type ResolvedSettings,
} from "@acadigma/domain/settings"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const SETTINGS_PATH = "/app/settings"

/** Any active member can read the resolved settings (F-OP-07 §3.1 — widened SELECT). */
export async function getSchoolSettings(): Promise<
  Result<ResolvedSettings, ApiError>
> {
  const ctx = await requireWorkspace()
  const supabase = await createClient()
  return getSchoolSettingsRepo(supabase, ctx)
}

/**
 * Owner/admin only (`policies.manage` — narrower than `settings.manage`, which
 * guards owner-only surfaces like modules and the danger zone; see
 * packages/domain/src/permissions.ts). A teacher or parent calling this gets
 * `forbidden` here, and would be refused again by `school_profiles_update` RLS even
 * if this check were somehow bypassed.
 */
export async function updateSchoolSettings(
  input: unknown
): Promise<Result<ResolvedSettings, ApiError>> {
  const parsed = schoolSettingsPatchSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "policies.manage")) {
    return err(
      apiError(
        "forbidden",
        "Only an owner or admin can change school settings."
      )
    )
  }

  const supabase = await createClient()
  const result = await updateSchoolSettingsRepo(supabase, ctx, parsed.data)
  if (result.ok) revalidatePath(SETTINGS_PATH)
  return result
}

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
  if (!writable.ok) {
    return err(
      apiError(
        "payment_required",
        writable.error.reason ??
          "This workspace is read-only. Upgrade to make changes — nothing has been deleted."
      )
    )
  }
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
