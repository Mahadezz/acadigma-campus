/**
 * F-ID-10 Part 1 (D-403, D-404): `user_preferences.ui_mode` / `text_size`.
 * User-scoped, not tenant-scoped (DATA-MODEL.md §1.7) — every function here
 * takes a `userId`, never a `WorkspaceContext`, the same shape
 * `(shared)/workspace/actions.ts`'s `updateLocale` already uses for
 * `profiles.locale` and for the identical reason: this is not a tenant
 * write, so there is no workspace to resolve.
 */

import { apiError, err, ok, uiPreferencesSchema } from "@acadigma/contracts"

import type {
  ApiError,
  Result,
  UiPreferences,
  UpdateUiPreferencesInput,
} from "@acadigma/contracts"
import type { AcadigmaSupabaseClient } from "../client"
import type { TablesUpdate } from "../types.generated"

const COLUMNS = "ui_mode, text_size"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

function toUiPreferences(row: {
  ui_mode: string
  text_size: string
}): UiPreferences {
  return uiPreferencesSchema.parse({
    uiMode: row.ui_mode,
    textSize: row.text_size,
  })
}

/**
 * F-ID-10 §3 "No row needed to read: a missing row reads as the defaults" —
 * in practice `app.handle_new_user()` already inserts the row for every
 * account, but this still resolves the documented default rather than
 * erroring if a row is ever absent (a deleted account mid-request, a future
 * change to the trigger).
 */
export async function fetchUiPreferences(
  supabase: AcadigmaSupabaseClient,
  userId: string
): Promise<Result<UiPreferences, ApiError>> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select(COLUMNS)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return ok({ uiMode: "full", textSize: "normal" })
  return ok(toUiPreferences(data))
}

/**
 * F-ID-10 §3 "the first change upserts": a plain UPDATE would silently
 * affect zero rows if the row were ever missing (RLS's `user_id = auth.uid()`
 * filters an UPDATE to nothing, it does not error), so this always upserts.
 * Only the keys present in `patch` are written — Postgres's
 * `INSERT ... ON CONFLICT (user_id) DO UPDATE SET <only the given columns>`
 * leaves every column not in the payload alone (or at its default, on the
 * insert branch), the same "only the supplied keys change" rule
 * `updateSchoolSettings`'s patch merge follows for `school_profiles`.
 */
export async function upsertUiPreferences(
  supabase: AcadigmaSupabaseClient,
  userId: string,
  patch: UpdateUiPreferencesInput
): Promise<Result<UiPreferences, ApiError>> {
  const values: TablesUpdate<"user_preferences"> = { user_id: userId }
  if (patch.uiMode !== undefined) values.ui_mode = patch.uiMode
  if (patch.textSize !== undefined) values.text_size = patch.textSize

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(values, { onConflict: "user_id" })
    .select(COLUMNS)
    .single()

  if (error || !data) return err(UNAVAILABLE)
  return ok(toUiPreferences(data))
}
