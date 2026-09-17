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
  type ApiError,
  type Result,
  type SchoolSettingsPatch,
} from "@acadigma/contracts"
import {
  getSchoolSettings as getSchoolSettingsRepo,
  updateSchoolSettings as updateSchoolSettingsRepo,
} from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import type { ResolvedSettings } from "@acadigma/domain/settings"

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
  const result = await updateSchoolSettingsRepo(
    supabase,
    ctx,
    parsed.data as SchoolSettingsPatch
  )
  if (result.ok) revalidatePath(SETTINGS_PATH)
  return result
}
