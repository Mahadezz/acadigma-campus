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

/** A salted, one-way key for throttle buckets and rate-limit lookups. Never the
 * raw email/IP — `auth_throttle.key` is not a place a plaintext address belongs. */
export function throttleKey(bucket: string, value: string): string {
  const salt = process.env.THROTTLE_KEY_SALT ?? "acadigma-campus-dev-salt"
  const hash = createHash("sha256")
    .update(`${salt}:${value.trim().toLowerCase()}`)
    .digest("hex")
  return `${bucket}:${hash}`
}
