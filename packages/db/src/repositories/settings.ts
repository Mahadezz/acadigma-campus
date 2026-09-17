/**
 * `school_profiles` read + partial update (F-OP-07 §3.1, §5.1, §7 `getSchoolSettings`
 * / `updateSchoolSettings`). Every row this repository returns has gone through
 * `resolve()` — nothing downstream is allowed to read `attendance_policy` etc.
 * straight off the table, because that is exactly how a renamed default key goes
 * silently unread (F-OP-07 §5.1, the `payroll_enabled` story).
 *
 * Every write here is a genuine `UPDATE` against `school_profiles`, so the
 * already-attached `app.attach_audit('public.school_profiles')` trigger
 * (`supabase/migrations/20260917010200_audit_and_files.sql`) writes the
 * before/after `audit_events` row inside the same transaction — this repository
 * never writes to `audit_events` itself (CLAUDE.md rule 9).
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
  type SchoolSettingsPatch,
} from "@acadigma/contracts"
import {
  resolve,
  type ResolvedSettings,
  type SchoolProfileRow,
} from "@acadigma/domain/settings"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const SETTINGS_COLUMNS =
  "workspace_id, timezone, working_days, attendance_policy, academic_settings, cover_policy, messaging_policy, branding"

const NOT_FOUND: ApiError = apiError(
  "not_found",
  "This workspace has no school profile."
)

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

async function fetchRow(
  supabase: AcadigmaSupabaseClient,
  workspaceId: string
): Promise<Result<SchoolProfileRow, ApiError>> {
  const { data, error } = await supabase
    .from("school_profiles")
    .select(SETTINGS_COLUMNS)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  return ok(data as unknown as SchoolProfileRow)
}

/** School-scoped settings, resolved against the shipped defaults (F-OP-07 §5.1). */
export async function getSchoolSettings(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<ResolvedSettings, ApiError>> {
  const row = await fetchRow(supabase, ctx.workspaceId)
  if (!row.ok) return row
  return ok(resolve(row.data))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Merges a patch onto the *stored* jsonb value (not the resolved/defaulted one), so
 * saving only stores what the school actually chose to override — a default value
 * never gets frozen into the row just because a consumer happened to resolve it
 * first.
 */
function mergedBlob(
  existing: unknown,
  patch: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!patch || Object.keys(patch).length === 0) return undefined
  const base = isPlainObject(existing) ? existing : {}
  return { ...base, ...patch }
}

/**
 * Applies a Zod-validated partial patch to `school_profiles` (owner/admin only —
 * gated by `policies.manage` in the calling server action, and independently by the
 * `school_profiles_update` RLS policy). Returns the freshly resolved settings.
 */
export async function updateSchoolSettings(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  patch: SchoolSettingsPatch
): Promise<Result<ResolvedSettings, ApiError>> {
  const current = await fetchRow(supabase, ctx.workspaceId)
  if (!current.ok) return current

  const update: Record<string, unknown> = {}
  if (patch.timezone !== undefined) update.timezone = patch.timezone
  if (patch.working_days !== undefined) update.working_days = patch.working_days

  const blobs = [
    ["attendance_policy", patch.attendance_policy],
    ["academic_settings", patch.academic_settings],
    ["cover_policy", patch.cover_policy],
    ["messaging_policy", patch.messaging_policy],
    ["branding", patch.branding],
  ] as const
  for (const [column, blobPatch] of blobs) {
    const merged = mergedBlob(
      (current.data as Record<string, unknown>)[column],
      blobPatch as Record<string, unknown> | undefined
    )
    if (merged) update[column] = merged
  }

  if (Object.keys(update).length === 0) {
    // Nothing to change — return the current resolved settings rather than issuing
    // a no-op UPDATE (and a no-op audit row).
    return ok(resolve(current.data))
  }

  const { data, error } = await supabase
    .from("school_profiles")
    .update(update)
    .eq("workspace_id", ctx.workspaceId)
    .select(SETTINGS_COLUMNS)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  return ok(resolve(data as unknown as SchoolProfileRow))
}
