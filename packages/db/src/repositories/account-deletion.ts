/**
 * F-ID-01 Part 7 (D-113): the caller's own account deletion. User-scoped,
 * not tenant-scoped — like `ui-preferences.ts`, nothing here takes a
 * `WorkspaceContext`. Every write is a SECURITY DEFINER function that acts
 * on `auth.uid()` only; there is no user id to pass, so none can be forged.
 */

import { apiError, err, ok } from "@acadigma/contracts"
import type {
  AccountDeletionBlocker,
  ApiError,
  Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/** The pending request's purge date, or null when nothing is scheduled.
 * Filtered by `userId` as well as RLS: platform staff can read every row. */
export async function getPendingAccountDeletion(
  supabase: AcadigmaSupabaseClient,
  userId: string
): Promise<Result<{ scheduledPurgeAt: string } | null, ApiError>> {
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("scheduled_purge_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  return ok(data ? { scheduledPurgeAt: data.scheduled_purge_at } : null)
}

/** Schools where the caller is the only active owner (each one blocks). */
export async function listAccountDeletionBlockers(
  supabase: AcadigmaSupabaseClient
): Promise<Result<AccountDeletionBlocker[], ApiError>> {
  const { data, error } = await supabase.rpc("account_deletion_blockers")
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((row) => ({
      workspaceId: row.workspace_id,
      name: row.name,
    }))
  )
}

export async function requestAccountDeletion(
  supabase: AcadigmaSupabaseClient
): Promise<Result<{ scheduledPurgeAt: string }, ApiError>> {
  const { data, error } = await supabase.rpc("request_account_deletion")
  if (error) {
    if (error.message === "SOLE_OWNER_BLOCKED") {
      return err(
        apiError(
          "forbidden",
          "You are the only owner of a school. Hand it over first."
        )
      )
    }
    if (error.code === "54000") {
      return err(
        apiError("rate_limited", "Too many requests today. Try again tomorrow.")
      )
    }
    return err(UNAVAILABLE)
  }
  return ok({ scheduledPurgeAt: data })
}

/** Idempotent: nothing pending is already the outcome the caller wants. */
export async function cancelAccountDeletion(
  supabase: AcadigmaSupabaseClient
): Promise<Result<{ cancelled: boolean }, ApiError>> {
  const { data, error } = await supabase.rpc("cancel_account_deletion")
  if (error) return err(UNAVAILABLE)
  return ok({ cancelled: data === true })
}
