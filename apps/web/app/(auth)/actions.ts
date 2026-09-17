"use server"

import { redirect } from "next/navigation"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
  registerWithPasswordInputSchema,
  signInWithPasswordInputSchema,
  resendVerificationInputSchema,
  passwordResetRequestInputSchema,
  passwordResetInputSchema,
  changePasswordInputSchema,
  type RegisterWithPasswordInput,
  type RegisterWithPasswordOutput,
  type SignInWithPasswordInput,
  type ResendVerificationInput,
  type PasswordResetRequestInput,
  type PasswordResetInput,
  type ChangePasswordInput,
  type ChangePasswordOutput,
} from "@acadigma/contracts"
import { safeReturnTo, checkPassword } from "@acadigma/domain/auth"

import { logAuthEvent } from "@/lib/audit"
import { logAuthEmail } from "@/lib/email-log"
import { getMessages } from "@/lib/i18n"
import { requestLogger } from "@/lib/logger"
import { getRequestContext, throttleKey } from "@/lib/request-context"
import { resolveLandingRoute } from "@/lib/resolve-landing-route"
import { getOrigin } from "@/lib/site-url"
import { createClient } from "@/lib/supabase/server"
import {
  throttleRecordFailure,
  throttleReset,
  throttleStatus,
} from "@/lib/throttle"

/**
 * F-ID-01 §7 "Server contracts": "All in apps/web/app/(auth)/actions.ts unless
 * noted." Parts 1-4 only — phone OTP, magic link, sessions/devices and account
 * deletion (Parts 5-7) add their own actions here later.
 *
 * Every action follows the five-step shape from HANDBOOK §8: parse -> context
 * (there is no WorkspaceContext pre-membership, so this step is "resolve the
 * Supabase client") -> policy (public / self, per F-ID-01 §2) -> domain +
 * Supabase Auth -> return the canonical Result. Nothing here throws a raw error
 * to the client except Next's redirect signal, which must stay outside try/catch.
 *
 * `resolveLandingRoute` lives in `lib/resolve-landing-route.ts`, not here (and is
 * not re-exported from here): a `"use server"` file may only export async
 * functions — Next treats every export as a Server Action — and that helper is
 * a plain synchronous stub. Import it directly from `lib/resolve-landing-route`.
 */

// ---------------------------------------------------------------------------
// Part 2 — register + email verification
// ---------------------------------------------------------------------------

export async function registerWithPassword(
  raw: unknown
): Promise<Result<RegisterWithPasswordOutput, ApiError>> {
  const parsed = registerWithPasswordInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      apiError(
        "validation_failed",
        "Check the highlighted fields and try again."
      )
    )
  }
  const {
    fullName,
    email,
    password,
    termsAccepted,
  }: RegisterWithPasswordInput = parsed.data
  void termsAccepted // literal(true) already enforced by the schema

  const { t } = await getMessages()
  const ctx = await getRequestContext()
  const supabase = await createClient()

  const ipKey = throttleKey("register", ctx.ip ?? "unknown")
  const status = await throttleStatus(supabase, ipKey)
  if (status.blocked) {
    return err(
      apiError(
        "rate_limited",
        t.auth.login.throttled.replace(
          "{seconds}",
          String(status.retryAfterSeconds)
        )
      )
    )
  }

  const passwordCheck = checkPassword({ password, email, fullName })
  if (!passwordCheck.ok) {
    await throttleRecordFailure(supabase, "register", ipKey)
    return err(apiError("validation_failed", passwordCheck.message))
  }

  const origin = await getOrigin()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/api/auth/callback?type=email&next=/onboarding`,
    },
  })

  if (error) {
    await throttleRecordFailure(supabase, "register", ipKey)
    const log = await requestLogger({ route: "auth.register" })
    log.warn(
      { status: error.status, code: error.code },
      "registration rejected"
    )
    return err(
      apiError(
        "dependency_unavailable",
        "Could not create your account. Try again shortly."
      )
    )
  }

  // Supabase's enumeration-safe default for an already-registered, already-confirmed
  // email is a *successful* signUp response whose user has no identities. §4.1
  // deliberately overrides that default: "registration cannot be enumeration-safe
  // and usable at once".
  const identityCount = data.user?.identities?.length ?? (data.user ? 1 : 0)
  if (!data.user || identityCount === 0) {
    await throttleRecordFailure(supabase, "register", ipKey)
    return err(apiError("conflict", t.auth.register.errorEmailTaken))
  }

  await throttleReset(supabase, ipKey)
  await logAuthEvent(supabase, {
    action: "account.registered",
    rowId: data.user.id,
    after: { email },
    context: ctx,
  })
  await logAuthEmail(
    email,
    "auth-verify-email",
    "Verify your Acadigma Campus email"
  )

  return ok({ userId: data.user.id, needsEmailVerification: true })
}

export async function requestEmailVerification(
  raw: unknown
): Promise<Result<{ ok: true }, ApiError>> {
  const parsed = resendVerificationInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(apiError("validation_failed", "Enter a valid email address."))
  }
  const { email }: ResendVerificationInput = parsed.data

  const supabase = await createClient()
  const key = throttleKey("resend-verify", email)
  const status = await throttleStatus(supabase, key)
  if (status.blocked) {
    const { t } = await getMessages()
    return err(
      apiError(
        "rate_limited",
        t.auth.login.throttled.replace(
          "{seconds}",
          String(status.retryAfterSeconds)
        )
      )
    )
  }

  const origin = await getOrigin()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback?type=email&next=/onboarding`,
    },
  })

  await throttleRecordFailure(supabase, "resendVerification", key)
  // Always ok:true — this mirrors the resend cooldown UX (§4.1) rather than
  // leaking whether the address exists or was already verified.
  if (!error) {
    await logAuthEmail(
      email,
      "auth-resend-verify-email",
      "Verify your Acadigma Campus email"
    )
  }
  return ok({ ok: true })
}

// ---------------------------------------------------------------------------
// Part 3 — sign in (password) + sign out
// ---------------------------------------------------------------------------

export async function signInWithPassword(
  raw: unknown
): Promise<Result<{ landingRoute: string }, ApiError>> {
  const parsed = signInWithPasswordInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      apiError(
        "validation_failed",
        "Check your email and password and try again."
      )
    )
  }
  const { email, password, next }: SignInWithPasswordInput = parsed.data

  const { t } = await getMessages()
  const ctx = await getRequestContext()
  const supabase = await createClient()

  const emailKey = throttleKey("login-email", email)
  const ipKey = throttleKey("login-ip", ctx.ip ?? "unknown")

  // AC6: the blocked attempt performs no credential check at all.
  const [emailStatus, ipStatus] = await Promise.all([
    throttleStatus(supabase, emailKey),
    throttleStatus(supabase, ipKey),
  ])
  const blocking = emailStatus.blocked
    ? emailStatus
    : ipStatus.blocked
      ? ipStatus
      : null
  if (blocking) {
    return err(
      apiError(
        "rate_limited",
        t.auth.login.throttled.replace(
          "{seconds}",
          String(blocking.retryAfterSeconds)
        )
      )
    )
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    await Promise.all([
      throttleRecordFailure(supabase, "loginByEmail", emailKey),
      throttleRecordFailure(supabase, "loginByIp", ipKey),
    ])
    const log = await requestLogger({ route: "auth.login" })
    // One generic message regardless of which half was wrong (§4.2).
    log.warn({ status: error.status, code: error.code }, "sign-in rejected")
    return err(
      apiError("unauthenticated", t.auth.login.errorInvalidCredentials)
    )
  }

  await Promise.all([
    throttleReset(supabase, emailKey),
    throttleReset(supabase, ipKey),
  ])

  const { data: profile } = await supabase
    .from("profiles")
    .select("suspended_at")
    .eq("id", data.user.id)
    .maybeSingle()

  if (profile && profile["suspended_at"]) {
    await supabase.auth.signOut()
    return err(apiError("forbidden", t.auth.login.errorSuspended))
  }

  await logAuthEvent(supabase, {
    action: "account.login",
    rowId: data.user.id,
    context: ctx,
  })

  const fallback = resolveLandingRoute()
  const destination = safeReturnTo(next, fallback)
  if (destination.rejected) {
    const log = await requestLogger({ route: "auth.login" })
    log.warn({ next }, "rejected an off-origin next parameter")
  }

  redirect(destination.path)
}

/** Clears the session, the workspace cookie and (client-side) the query/offline
 * caches — 4.10, the fix for the prototype's logout never clearing
 * `activeWorkspaceId`. The cookie clear happens here; the client clears its own
 * in-memory caches in the component that calls this action. */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    await logAuthEvent(supabase, { action: "account.logout", rowId: user.id })
  }
  await supabase.auth.signOut()
  redirect("/login")
}

// ---------------------------------------------------------------------------
// Part 4 — forgot / reset / change password
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  raw: unknown
): Promise<Result<{ ok: true }, ApiError>> {
  const parsed = passwordResetRequestInputSchema.safeParse(raw)
  if (!parsed.success) {
    // Even a malformed email returns the generic ok — §9 AC8: indistinguishable
    // from the address-exists case, in both response and timing.
    return ok({ ok: true })
  }
  const { email }: PasswordResetRequestInput = parsed.data

  const supabase = await createClient()
  const key = throttleKey("reset-request", email)
  const status = await throttleStatus(supabase, key)
  if (!status.blocked) {
    const origin = await getOrigin()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset`,
    })
    await throttleRecordFailure(supabase, "passwordResetRequest", key)
    if (!error) {
      await logAuthEmail(
        email,
        "auth-reset-password",
        "Reset your Acadigma Campus password"
      )
    }
  }
  // AC8: identical response whether the throttle tripped, the send failed, or
  // the address does not exist.
  return ok({ ok: true })
}

export async function resetPassword(
  raw: unknown
): Promise<Result<{ ok: true }, ApiError>> {
  const parsed = passwordResetInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(apiError("validation_failed", "Enter a new password."))
  }
  const { tokenHash, password }: PasswordResetInput = parsed.data

  const ctx = await getRequestContext()
  const supabase = await createClient()

  const ipKey = throttleKey("reset-submit", ctx.ip ?? "unknown")
  const status = await throttleStatus(supabase, ipKey)
  if (status.blocked) {
    const { t } = await getMessages()
    return err(
      apiError(
        "rate_limited",
        t.auth.login.throttled.replace(
          "{seconds}",
          String(status.retryAfterSeconds)
        )
      )
    )
  }

  const { data: verifyData, error: verifyError } =
    await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    })

  if (verifyError || !verifyData.user) {
    await throttleRecordFailure(supabase, "passwordResetSubmit", ipKey)
    return err(apiError("unauthenticated", "TOKEN_INVALID"))
  }

  const passwordCheck = checkPassword({
    password,
    email: verifyData.user.email,
    fullName: (verifyData.user.user_metadata as { full_name?: string } | null)
      ?.full_name,
  })
  if (!passwordCheck.ok) {
    return err(apiError("validation_failed", passwordCheck.message))
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    await throttleRecordFailure(supabase, "passwordResetSubmit", ipKey)
    return err(
      apiError(
        "dependency_unavailable",
        "Could not change your password. Try again."
      )
    )
  }

  await throttleReset(supabase, ipKey)

  // §4.5: "all other sessions are revoked, the user is signed in on the
  // current device". `scope: "others"` keeps this session alive.
  await supabase.auth.signOut({ scope: "others" })

  await logAuthEvent(supabase, {
    action: "account.password_reset",
    rowId: verifyData.user.id,
    context: ctx,
  })
  await logAuthEvent(supabase, {
    action: "session.revoked_all",
    rowId: verifyData.user.id,
    context: ctx,
  })

  return ok({ ok: true })
}

export async function changePassword(
  raw: unknown
): Promise<Result<ChangePasswordOutput, ApiError>> {
  const parsed = changePasswordInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      apiError(
        "validation_failed",
        "Check the highlighted fields and try again."
      )
    )
  }
  const { currentPassword, password, signOutOthers }: ChangePasswordInput =
    parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const ctx = await getRequestContext()
  const key = throttleKey("change-password", user.id)
  const status = await throttleStatus(supabase, key)
  if (status.blocked) {
    const { t } = await getMessages()
    return err(
      apiError(
        "rate_limited",
        t.auth.login.throttled.replace(
          "{seconds}",
          String(status.retryAfterSeconds)
        )
      )
    )
  }

  // Re-authentication: confirm the current password before anything changes.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (reauthError) {
    await throttleRecordFailure(supabase, "changePassword", key)
    return err(
      apiError("unauthenticated", "Your current password is incorrect.")
    )
  }

  const passwordCheck = checkPassword({
    password,
    email: user.email,
    fullName: (user.user_metadata as { full_name?: string } | null)?.full_name,
  })
  if (!passwordCheck.ok) {
    return err(apiError("validation_failed", passwordCheck.message))
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return err(
      apiError(
        "dependency_unavailable",
        "Could not change your password. Try again."
      )
    )
  }
  await throttleReset(supabase, key)

  let revokedSessions = 0
  if (signOutOthers) {
    await supabase.auth.signOut({ scope: "others" })
    revokedSessions = 1 // Supabase does not report a count; "at least one" is honest.
  }

  await logAuthEvent(supabase, {
    action: "account.password_changed",
    rowId: user.id,
    context: ctx,
  })
  if (signOutOthers) {
    await logAuthEvent(supabase, {
      action: "session.revoked_all",
      rowId: user.id,
      context: ctx,
    })
  }

  return ok({ ok: true, revokedSessions })
}
