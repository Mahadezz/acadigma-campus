/**
 * F-ID-01 Part 6 (D-116): the caller's own signed-in devices. User-scoped,
 * like `account-deletion.ts`: every function acts on `auth.uid()` inside the
 * database, so there is no user id to pass and none to forge.
 */

import { apiError, err, ok } from "@acadigma/contracts"
import type { ApiError, Result, SessionSummary } from "@acadigma/contracts"
import { deviceLabel } from "@acadigma/domain/auth"

import type { AcadigmaSupabaseClient } from "../client"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/** Live sessions, the current one first. The user agent becomes a label
 * here and goes no further. */
export async function listMySessions(
  supabase: AcadigmaSupabaseClient
): Promise<Result<SessionSummary[], ApiError>> {
  const { data, error } = await supabase.rpc("my_sessions")
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      label: deviceLabel(row.user_agent),
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      isCurrent: row.is_current,
    }))
  )
}

/** Idempotent: `revoked: false` when the session is already gone, is not
 * the caller's, or is the current one (D-116 §3). */
export async function revokeMySession(
  supabase: AcadigmaSupabaseClient,
  sessionId: string
): Promise<Result<{ revoked: boolean }, ApiError>> {
  const { data, error } = await supabase.rpc("revoke_my_session", {
    p_session_id: sessionId,
  })
  if (error) return err(UNAVAILABLE)
  return ok({ revoked: data === true })
}

/** Raises `auth.new_device_signin` when another session is live. */
export async function noteSignIn(
  supabase: AcadigmaSupabaseClient
): Promise<Result<{ notified: boolean }, ApiError>> {
  const { data, error } = await supabase.rpc("note_sign_in")
  if (error) return err(UNAVAILABLE)
  return ok({ notified: data === true })
}
