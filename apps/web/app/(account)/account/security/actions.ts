"use server"

import { cookies } from "next/headers"

import {
  accountDeletionRequestInputSchema,
  apiError,
  apiErrorFromZod,
  err,
  ok,
  type AccountDeletionRequestOutput,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import {
  cancelAccountDeletion as cancelDeletion,
  requestAccountDeletion as requestDeletion,
} from "@acadigma/db/repositories/account-deletion"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import {
  throttleRecordFailure,
  throttleStatus,
  USER_THROTTLE_KEYS,
} from "@/lib/throttle"
import { throttledMessage } from "@/lib/throttle-copy"
import { TEXT_SIZE_COOKIE, UI_MODE_COOKIE } from "@/lib/ui-preferences"
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie"

/**
 * F-ID-01 Part 7 (§4.9, D-113). Self-service, pre-membership: the "policy"
 * step is "this is your own account", which the database functions enforce
 * by acting on auth.uid() only. Not in `(auth)/actions.ts` because that file
 * is being changed by an open PR (#90); same five-step shape.
 */
export async function requestAccountDeletion(
  raw: unknown
): Promise<Result<AccountDeletionRequestOutput, ApiError>> {
  const parsed = accountDeletionRequestInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  // Wrong passwords share the per-user re-authentication bucket (D-113 §7).
  const key = USER_THROTTLE_KEYS.changePassword
  const status = await throttleStatus(supabase, key)
  if (status.blocked) {
    const { t, locale } = await getMessages()
    return err(
      apiError(
        "rate_limited",
        throttledMessage(
          t.auth.login.throttled,
          status.retryAfterSeconds,
          locale
        ),
        { retryAfterSeconds: status.retryAfterSeconds }
      )
    )
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  })
  if (reauthError) {
    await throttleRecordFailure(supabase, "changePassword", key)
    return err(
      apiError("unauthenticated", "That password is not correct.", {
        fieldErrors: { password: ["That password is not correct."] },
      })
    )
  }

  const result = await requestDeletion(supabase)
  if (!result.ok) return result

  // §4.9 step 3: every session ends; they sign in again to see the banner.
  await supabase.auth.signOut({ scope: "global" })
  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_COOKIE)
  cookieStore.delete(UI_MODE_COOKIE)
  cookieStore.delete(TEXT_SIZE_COOKIE)

  return ok(result.data)
}

/** "Keep my account" — one tap, idempotent. */
export async function cancelAccountDeletion(): Promise<
  Result<{ cancelled: boolean }, ApiError>
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }
  return cancelDeletion(supabase)
}
