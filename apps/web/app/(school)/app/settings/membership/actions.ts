"use server"

/**
 * F-ID-03 Part 7 (D-112) — leave this school (§4.6) and transfer ownership
 * (§4.7). Shape: parse → workspace context → `can()` → (requireWritable for
 * the transfer) → repository → Result. The guard trigger and
 * `public.transfer_ownership` re-check every rule in the database.
 */

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import {
  apiError,
  apiErrorFromZod,
  err,
  MEMBER_ERROR,
  ok,
  planReadOnlyApiError,
  transferOwnershipInputSchema,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import {
  getWorkspaceName,
  leaveWorkspace as leaveWorkspaceRow,
  requireWritable,
  transferOwnership as transferOwnershipRow,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { getMessages } from "@/lib/i18n"
import { resolveLandingRoute } from "@/lib/resolve-landing-route"
import { createClient } from "@/lib/supabase/server"
import {
  throttleRecordFailure,
  throttleStatus,
  USER_THROTTLE_KEYS,
} from "@/lib/throttle"
import { throttledMessage } from "@/lib/throttle-copy"
import { requireWorkspace } from "@/lib/workspace"
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie"

const FORBIDDEN = apiError("forbidden", "You cannot do this in this school.")

function marked(
  code: ApiError["code"],
  message: string,
  marker: string
): ApiError {
  return { ...apiError(code, message), fieldErrors: { _root: [marker] } }
}

/**
 * The caller leaves the current school. Not gated by `requireWritable`
 * (EXEMPT in scripts/check-require-writable.mjs): ending your own access is
 * always allowed, even on a read-only plan (D-300, D-112). On success the
 * workspace cookie is dropped and the caller is told where to land next.
 */
export async function leaveWorkspace(): Promise<
  Result<{ landingRoute: string }, ApiError>
> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "members.leave")) return err(FORBIDDEN)
  const supabase = await createClient()

  const result = await leaveWorkspaceRow(ctx, supabase)
  if (!result.ok) return result

  const cookieStore = await cookies()
  cookieStore.delete(WORKSPACE_COOKIE)
  revalidatePath("/", "layout")
  return ok({ landingRoute: await resolveLandingRoute(supabase) })
}

/** "Same name" means the same letters, ignoring case and spacing. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
  return norm(a) === norm(b)
}

/**
 * Hand the school to an active admin or teacher (§4.7). Order matters: the
 * typed name and the password are both checked BEFORE the transfer runs, and
 * the password check shares the `changePassword` throttle bucket (D-112) so
 * this form is not a second, separately budgeted password oracle.
 */
export async function transferOwnership(
  input: unknown
): Promise<Result<{ id: string }, ApiError>> {
  const parsed = transferOwnershipInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "workspace.ownership.transfer")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const name = await getWorkspaceName(ctx, supabase)
  if (!name.ok) return name
  if (!sameName(name.data, parsed.data.confirmName)) {
    return err(
      marked(
        "validation_failed",
        "Type the school's name exactly as shown.",
        MEMBER_ERROR.CONFIRM_NAME_MISMATCH
      )
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }
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
    password: parsed.data.currentPassword,
  })
  if (reauthError) {
    await throttleRecordFailure(supabase, "changePassword", key)
    return err(
      marked(
        "unauthenticated",
        "That password is not correct.",
        MEMBER_ERROR.REAUTH_FAILED
      )
    )
  }

  const result = await transferOwnershipRow(ctx, supabase, {
    memberId: parsed.data.memberId,
    keepOwner: parsed.data.keepOwner,
  })
  if (result.ok) {
    revalidatePath("/app/staff/team")
    revalidatePath("/app/settings/membership")
  }
  return result
}
