/**
 * `onboarding_progress` read/write (F-ID-05 §3, §7 `getOnboardingState` /
 * `saveOnboardingDraft` / `completeOnboarding`). Every function here takes
 * the caller's own `userId`, not a `WorkspaceContext` — onboarding runs
 * before any workspace membership is resolvable (§2), so there is no
 * workspace to scope by yet. RLS (`user_id = app.current_user_id()`) is the
 * real boundary; `userId` is only ever the id `auth.getUser()` returned for
 * this request, never accepted from client input (ARCHITECTURE §3 rule 2's
 * "tenant context never comes from the client" applies just as much to a
 * user id as to a workspace id).
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { Json, TablesInsert } from "../types.generated"

export type OnboardingPathRow = "undecided" | "create_school" | "join_school"

export type OnboardingProgressState = {
  path: OnboardingPathRow
  step: number
  draft: Record<string, unknown>
  completedAt: string | null
}

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/** §4.7: the row does not exist until the first draft save — a fresh
 * account with no wizard progress yet is exactly this shape, not an error. */
const FRESH_STATE: OnboardingProgressState = {
  path: "undecided",
  step: 1,
  draft: {},
  completedAt: null,
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function getOnboardingProgress(
  supabase: AcadigmaSupabaseClient,
  userId: string
): Promise<Result<OnboardingProgressState, ApiError>> {
  const { data, error } = await supabase
    .from("onboarding_progress")
    .select("path, step, draft, completed_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return ok(FRESH_STATE)

  return ok({
    path: data.path,
    step: data.step,
    draft: isPlainObject(data.draft) ? data.draft : {},
    completedAt: data.completed_at,
  })
}

export type SaveOnboardingDraftArgs = {
  path: OnboardingPathRow
  step: number
  draft: Record<string, unknown>
}

/**
 * Upserts the caller's draft. Omits `started_at` from the payload on
 * purpose: on a fresh insert the column default applies; on a conflict
 * (every save after the first) PostgREST's upsert only sets the columns
 * named here, so an in-progress wizard's original start time never moves.
 *
 * Always clears `completed_at` (F-ID-05 §11, PR #24's Part 2 status note,
 * D-60's flagged follow-up): a caller who already finished onboarding once
 * (e.g. the tutoring exit) and re-enters via the switcher to start a new
 * draft would otherwise keep the old `completed_at`, and
 * `resolveOnboardingChooserView`'s `isResumable` check requires
 * `!completedAt` — the chooser would never offer to resume a draft actively
 * being saved. Actively saving wizard progress is definitionally "not
 * finished yet"; `completeOnboarding` (`markOnboardingComplete` below) is
 * the only place that sets it back.
 */
export async function saveOnboardingDraft(
  supabase: AcadigmaSupabaseClient,
  userId: string,
  input: SaveOnboardingDraftArgs
): Promise<Result<{ savedAt: string }, ApiError>> {
  const row: TablesInsert<"onboarding_progress"> = {
    user_id: userId,
    path: input.path,
    step: input.step,
    draft: input.draft as Json,
    completed_at: null,
  }

  const { data, error } = await supabase
    .from("onboarding_progress")
    .upsert(row, { onConflict: "user_id" })
    .select("updated_at")
    .single()

  if (error) return err(UNAVAILABLE)
  return ok({ savedAt: data.updated_at })
}

/**
 * §4.7: "the row is cleared by setting completed_at and nulling draft" —
 * plus `profiles.onboarding_completed_at`, the flag `resolveOnboardingAccess`
 * and every future sign-in check on (F-ID-03 §4.4, AC11/AC12).
 *
 * Two sequential, self-scoped updates rather than one RPC/transaction: both
 * tables are only ever writable as the caller themselves under RLS, both
 * writes are idempotent (setting the same timestamp twice is a no-op in
 * effect), and there is no other writer this could race against — a
 * SECURITY DEFINER function would buy atomicity this operation does not
 * actually need. Upserts `onboarding_progress` (not a plain UPDATE) because
 * a user who exits via the tutoring link before ever calling
 * `saveOnboardingDraft` has no row yet.
 */
export async function markOnboardingComplete(
  supabase: AcadigmaSupabaseClient,
  userId: string
): Promise<Result<{ ok: true }, ApiError>> {
  const now = new Date().toISOString()

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: now })
    .eq("id", userId)
  if (profileError) return err(UNAVAILABLE)

  const { error: progressError } = await supabase
    .from("onboarding_progress")
    .upsert(
      { user_id: userId, completed_at: now, draft: null },
      { onConflict: "user_id" }
    )
  if (progressError) return err(UNAVAILABLE)

  return ok({ ok: true })
}
