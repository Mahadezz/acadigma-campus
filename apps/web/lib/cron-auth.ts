import { timingSafeEqual } from "node:crypto"

/**
 * `CRON_SECRET` is the whole authorization model for `/api/cron/*` (HANDBOOK
 * §5.4). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Constant-time:
 * an early-exit `===` leaks the secret's length via timing. Fails closed: an
 * unset secret authorizes nobody.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const provided = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
