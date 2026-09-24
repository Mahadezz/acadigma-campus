import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { httpStatusForError } from "@acadigma/contracts"
import { runTrialExpiryJob, withServiceRole } from "@acadigma/db"

import { requestLogger } from "@/lib/logger"

/**
 * The daily billing tick (F-CM-06 Part 4, §7 `runSubscriptionJobs`, D-62).
 *
 * `GET` only: Vercel Cron Jobs invoke a route with `GET` (not configurable)
 * and add `Authorization: Bearer $CRON_SECRET` itself. §7 names this `POST`;
 * that method is deferred until a manual-trigger caller actually exists
 * (see spec §11).
 *
 * Scope (D-62): the only transition this Part implements is a Pro trial past
 * `trial_ends_at` moving its workspace to `access_mode = 'read_only'` — see
 * `public.expire_pro_trials()` and the school-shell banner. §7's fuller
 * response shape belongs to Parts 5-8, not built yet.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Constant-time: an early-exit `===` leaks the secret's length via timing. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail closed: an unset secret authorizes nobody.

  const provided = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } }
    )
  }

  const result = await withServiceRole(
    "billing-tick: expire Pro trials past trial_ends_at",
    runTrialExpiryJob
  )

  if (!result.ok) {
    const log = await requestLogger({ route: "cron.billing.tick" })
    log.error({ code: result.error.code }, "billing tick failed")
    return NextResponse.json(
      { error: result.error.message },
      {
        status: httpStatusForError(result.error.code),
        headers: { "cache-control": "no-store" },
      }
    )
  }

  return NextResponse.json(result.data, {
    headers: { "cache-control": "no-store" },
  })
}
