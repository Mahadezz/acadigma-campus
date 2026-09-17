import "server-only"

import { z } from "zod"

import { requestLogger } from "@/lib/logger"

import type { AcadigmaSupabaseClient } from "@acadigma/db"

/**
 * Named limits from F-ID-01 §5/§7 "Business rules" / "Server contracts". These are
 * documentation only, and MUST match the `values` table inside
 * `public.throttle_record_failure` (migration 20260917020000 §3) by hand — the
 * actual thresholds live in Postgres now, not here. Security review N2: a caller
 * who can name a throttle key must not also be able to name the limit, so
 * `throttleRecordFailure` below sends only a bucket name; the server resolves it
 * to a threshold the client never sees or supplies.
 */
export const THROTTLE_LIMITS = {
  /** "Registrations per IP: 5 / hour" */
  register: { maxAttempts: 5, windowSeconds: 3600, blockSeconds: 3600 },
  /** "Sign-in failures: 5 per (email, 15 min) -> 15 min block" */
  loginByEmail: { maxAttempts: 5, windowSeconds: 900, blockSeconds: 900 },
  /** "30 per (IP, 15 min) -> 60 min block" */
  loginByIp: { maxAttempts: 30, windowSeconds: 900, blockSeconds: 3600 },
  /** "Request password reset ... 5/h" (§7 resend/reset rows) */
  passwordResetRequest: {
    maxAttempts: 5,
    windowSeconds: 3600,
    blockSeconds: 3600,
  },
  /** "resetPassword ... 10/h per IP" */
  passwordResetSubmit: {
    maxAttempts: 10,
    windowSeconds: 3600,
    blockSeconds: 3600,
  },
  /** "requestEmailVerification ... 5/h" */
  resendVerification: {
    maxAttempts: 5,
    windowSeconds: 3600,
    blockSeconds: 3600,
  },
  /** "changePassword ... 10/h per user" */
  changePassword: { maxAttempts: 10, windowSeconds: 3600, blockSeconds: 3600 },
} as const

export type ThrottleBucket = keyof typeof THROTTLE_LIMITS

export type ThrottleState = { blocked: boolean; retryAfterSeconds: number }

/** `unknown` in from PostgREST, parsed rather than cast (HANDBOOK §8: "unknown +
 * a Zod parse is the escape hatch"). Both RPCs return a one-row `table(...)`. */
const throttleRowSchema = z.object({
  blocked: z.boolean(),
  retry_after_seconds: z.number().int().min(0),
})

/**
 * Security review N3: this module used to fail OPEN — silently — on any RPC
 * error or shape drift, which is the rate limiter being entirely absent with
 * no signal. A throttle check that cannot prove "not blocked" must not wave
 * the caller through: it now fails CLOSED with a fixed, short delay, and logs
 * loudly so a real outage or a schema drift is visible instead of silently
 * regressing AC6 to zero. `auth_throttle` is still a second wall behind
 * Supabase Auth's own rate limits (F-ID-01 §3), so a brief false block on a
 * genuine outage is the safer failure mode than an unthrottled one.
 */
const FAIL_CLOSED: ThrottleState = { blocked: true, retryAfterSeconds: 60 }

function parseThrottleRow(data: unknown): ThrottleState | null {
  const row = Array.isArray(data) ? data[0] : data
  const parsed = throttleRowSchema.safeParse(row)
  if (!parsed.success) return null
  return {
    blocked: parsed.data.blocked,
    retryAfterSeconds: parsed.data.retry_after_seconds,
  }
}

/** Logs the fail-closed event with a correlation id (N3) so it can be alerted
 * on rather than discovered later as "sign-in got slower for everyone". */
async function logThrottleFailClosed(
  fn: "throttle_status" | "throttle_record_failure",
  reason:
    | { kind: "rpc_error"; message: string; code?: string }
    | { kind: "shape_drift" }
): Promise<void> {
  const log = await requestLogger({ route: "auth.throttle" })
  log.warn({ fn, ...reason }, "throttle RPC failed; failing closed")
}

/** Read-only check. Call BEFORE the sensitive work (AC6: the blocked attempt
 * performs no credential check). Fails CLOSED on any RPC error (N3). */
export async function throttleStatus(
  supabase: AcadigmaSupabaseClient,
  key: string
): Promise<ThrottleState> {
  const { data, error } = await supabase.rpc("throttle_status", { p_key: key })
  if (error) {
    await logThrottleFailClosed("throttle_status", {
      kind: "rpc_error",
      message: error.message,
      code: error.code,
    })
    return FAIL_CLOSED
  }
  const parsed = parseThrottleRow(data)
  if (!parsed) {
    await logThrottleFailClosed("throttle_status", { kind: "shape_drift" })
    return FAIL_CLOSED
  }
  return parsed
}

/** Call on a FAILED attempt only. `bucket` selects the server-side threshold
 * (security review N2) — the client names a bucket, never a limit. Fails
 * CLOSED on any RPC error (N3), same as throttleStatus. */
export async function throttleRecordFailure(
  supabase: AcadigmaSupabaseClient,
  bucket: ThrottleBucket,
  key: string
): Promise<ThrottleState> {
  const { data, error } = await supabase.rpc("throttle_record_failure", {
    p_bucket: bucket,
    p_key: key,
  })
  if (error) {
    await logThrottleFailClosed("throttle_record_failure", {
      kind: "rpc_error",
      message: error.message,
      code: error.code,
    })
    return FAIL_CLOSED
  }
  const parsed = parseThrottleRow(data)
  if (!parsed) {
    await logThrottleFailClosed("throttle_record_failure", {
      kind: "shape_drift",
    })
    return FAIL_CLOSED
  }
  return parsed
}

/** Call on a successful attempt, so attempts made before it never penalise it. */
export async function throttleReset(
  supabase: AcadigmaSupabaseClient,
  key: string
): Promise<void> {
  await supabase.rpc("throttle_reset", { p_key: key })
}
