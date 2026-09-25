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
  type SchoolProfileFields,
  type SchoolProfilePatch,
  type SchoolSettingsPatch,
} from "@acadigma/contracts"
import {
  resolve,
  type Branding,
  type ResolvedSettings,
  type SchoolProfileRow,
} from "@acadigma/domain/settings"

import type { AcadigmaSupabaseClient } from "../client"
import type { Json, TablesUpdate } from "../types.generated"
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
  return ok(
    data as unknown as SchoolProfileRow /* TODO(types): replace with generated Database row type once `pnpm db:types` runs against the project (types.generated.ts is a placeholder) */
  )
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

  // Typed from the generated schema, so a misspelled column or a wrong value
  // type is a compile error rather than a silent no-op UPDATE.
  const update: TablesUpdate<"school_profiles"> = {}
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
    // mergedBlob only ever returns plain JSON objects (it deep-merges JSON
    // blobs read from the same jsonb columns), so the Json cast is sound.
    if (merged) update[column] = merged as Json
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

// ---------------------------------------------------------------------------
// F-OP-07 Part 1 — school profile + branding (§4 W2, §7). Optimistic
// concurrency: the caller sends back the `updated_at` it loaded as `version`,
// and the UPDATE only matches while that is still the row's `updated_at`
// (`app.attach_updated_at` bumps it on every write). Zero rows matched means
// someone else saved first -> `conflict`, nothing clobbered (§9 AC5).
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = [
  "legal_name",
  "eiin",
  "board",
  "school_type",
  "medium",
  "motto",
  "address_line1",
  "address_line2",
  "city",
  "district",
  "postal_code",
  "contact_email",
  "contact_phone",
  "website",
  "bin_number",
  "vat_number",
] as const satisfies readonly (keyof SchoolProfileFields)[]

const PROFILE_COLUMNS = `${PROFILE_FIELDS.join(", ")}, branding, updated_at`

/**
 * Stored values as-is: `board`/`medium` may still hold a pre-enum legacy value
 * (column defaults `'BD National'`/`'Bangla'`), so they are plain strings here
 * and the form treats an unrecognised value as "not chosen yet".
 */
export type SchoolProfile = {
  version: string
  fields: Record<(typeof PROFILE_FIELDS)[number], string | null>
  branding: Branding
}

export const STALE_VERSION: ApiError = apiError(
  "conflict",
  "Someone else saved these settings first. Reload to see their changes, then try again."
)

function toProfile(row: Record<string, unknown>): SchoolProfile {
  const fields = {} as SchoolProfile["fields"]
  for (const key of PROFILE_FIELDS) {
    const value = row[key]
    fields[key] = typeof value === "string" ? value : null
  }
  return {
    version: String(row["updated_at"]),
    fields,
    branding: resolve({ branding: row["branding"] }).branding,
  }
}

export async function getSchoolProfile(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<SchoolProfile, ApiError>> {
  const { data, error } = await supabase
    .from("school_profiles")
    .select(PROFILE_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  return ok(toProfile(data as unknown as Record<string, unknown>))
}

export async function updateSchoolProfile(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: {
    version: string
    profile?: SchoolProfilePatch
    branding?: Partial<Branding>
  }
): Promise<Result<SchoolProfile, ApiError>> {
  const update: TablesUpdate<"school_profiles"> = { ...input.profile }

  if (input.branding && Object.keys(input.branding).length > 0) {
    // Merge onto the *stored* blob (see mergedBlob): a default never gets frozen in.
    const current = await fetchRow(supabase, ctx.workspaceId)
    if (!current.ok) return current
    update.branding = mergedBlob(current.data.branding, input.branding) as Json
  }

  if (Object.keys(update).length === 0) return getSchoolProfile(supabase, ctx)

  const { data, error } = await supabase
    .from("school_profiles")
    .update(update)
    .eq("workspace_id", ctx.workspaceId)
    .eq("updated_at", input.version)
    .select(PROFILE_COLUMNS)
    .maybeSingle()

  // No 23505 branch: `eiin` is not in the patch (D-100), so no unique
  // index this UPDATE can trip.
  if (error) return err(UNAVAILABLE)
  if (!data) return err(STALE_VERSION)
  return ok(toProfile(data as unknown as Record<string, unknown>))
}
