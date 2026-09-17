import "server-only"

import { headers } from "next/headers"

/**
 * The origin to build email-redirect and callback URLs from. Prefers the actual
 * request host (correct on every Vercel preview deployment) and falls back to
 * `APP_URL` only when headers are unavailable, e.g. outside a request.
 */
export async function getOrigin(): Promise<string> {
  const h = await headers()
  const forwardedHost = h.get("x-forwarded-host") ?? h.get("host")
  const forwardedProto = h.get("x-forwarded-proto") ?? "https"
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return process.env.APP_URL ?? "http://localhost:3000"
}
