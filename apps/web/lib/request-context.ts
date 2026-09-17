import "server-only"

import { createHash } from "node:crypto"

import { headers } from "next/headers"

/**
 * Request metadata every auth action needs: a stable-but-unlinkable throttle key
 * (F-ID-01 §5 rate limits are keyed by email/phone/IP, never stored raw — CLAUDE.md
 * rule 13 "log ids, never ... phone numbers"), the caller's IP for audit rows, and
 * the user agent for the device-label heuristics Part 6 will use.
 */
export type RequestContext = {
  ip: string | null
  userAgent: string | null
}

export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers()
  // Vercel sets x-forwarded-for; the first entry is the original client.
  const forwardedFor = h.get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null
  const userAgent = h.get("user-agent")
  return { ip, userAgent }
}

/**
 * A salted, one-way key for throttle buckets and rate-limit lookups. Never the
 * raw email/IP — `auth_throttle.key` is not a place a plaintext address belongs.
 *
 * The salt is a **secret**, not a namespace. `public.throttle_reset` and
 * `public.throttle_record_failure` are granted to `anon` (registration and
 * sign-in run before a session exists — migration 20260917020000 §6), so the
 * only thing stopping a hostile caller from clearing their own bucket before
 * every attempt — or blocking a chosen victim's email outright — is that they
 * cannot compute the key. A salt that is a literal in this repository is not a
 * secret, so outside development it is required rather than defaulted.
 */
function throttleSalt(): string {
  const salt = process.env.THROTTLE_KEY_SALT
  if (salt && salt.length > 0) return salt
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "THROTTLE_KEY_SALT is not set. Auth rate limiting only holds while the " +
        "throttle keys are unguessable; refusing to fall back to a value that " +
        "is committed to the repository."
    )
  }
  return "acadigma-campus-dev-salt"
}

export function throttleKey(bucket: string, value: string): string {
  const salt = throttleSalt()
  const hash = createHash("sha256")
    .update(`${salt}:${value.trim().toLowerCase()}`)
    .digest("hex")
  return `${bucket}:${hash}`
}
