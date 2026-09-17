import "server-only"

import { z } from "zod"

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

function parseThrottleRow(data: unknown): ThrottleState {
  const row = Array.isArray(data) ? data[0] : data
  const parsed = throttleRowSchema.safeParse(row)
  // Fail OPEN on a parse error would be wrong for a rate limiter that guards
  // credential checks — but failing closed (always-blocked) on our own RPC
  // shape drifting would take sign-in down with it. We fail open here because
  // `auth_throttle` is a second wall behind Supabase Auth's own rate limits
  // (F-ID-01 §3), never the only one.
  if (!parsed.success) return { blocked: false, retryAfterSeconds: 0 }
  return {
    blocked: parsed.data.blocked,
    retryAfterSeconds: parsed.data.retry_after_seconds,
  }
}

/** Read-only check. Call BEFORE the sensitive work (AC6: the blocked attempt
 * performs no credential check). */
export async function throttleStatus(
  supabase: AcadigmaSupabaseClient,
  key: string
): Promise<ThrottleState> {
  const { data, error } = await supabase.rpc("throttle_status", { p_key: key })
  if (error) return { blocked: false, retryAfterSeconds: 0 }
  return parseThrottleRow(data)
}

/** Call on a FAILED attempt only. `bucket` selects the server-side threshold
 * (security review N2) — the client names a bucket, never a limit. */
export async function throttleRecordFailure(
  supabase: AcadigmaSupabaseClient,
  bucket: ThrottleBucket,
  key: string
): Promise<ThrottleState> {
  const { data, error } = await supabase.rpc("throttle_record_failure", {
    p_bucket: bucket,
    p_key: key,
  })
  if (error) return { blocked: false, retryAfterSeconds: 0 }
  return parseThrottleRow(data)
}

/** Call on a successful attempt, so attempts made before it never penalise it. */
export async function throttleReset(
  supabase: AcadigmaSupabaseClient,
  key: string
): Promise<void> {
  await supabase.rpc("throttle_reset", { p_key: key })
}
