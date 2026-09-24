import { NextResponse } from "next/server"

import { httpStatusForError } from "@acadigma/contracts"
import { runTrialExpiryJob, withServiceRole } from "@acadigma/db"

import { requestLogger } from "@/lib/logger"

/**
 * The daily billing tick (F-CM-06 Part 4, §7 `runSubscriptionJobs`, D-62).
 *
 * F-CM-06 §7 names this route `POST /api/cron/billing/tick`, but Vercel Cron
 * Jobs only ever invoke a route with `GET` (there is no way to configure the
 * method), adding `Authorization: Bearer $CRON_SECRET` itself when the
 * project has that env var set (HANDBOOK §5.4 / SECURITY.md's STRIDE row S —
 * "CRON_SECRET on /api/cron/*; ... both 401 without it"). `GET` is therefore
 * what production actually calls; `POST` is kept too, for a manual/scripted
 * trigger carrying the same header, and both run the identical check and job.
 *
 * Scope (D-62): the only transition this Part implements is a Pro trial past
 * `trial_ends_at` moving its workspace to `access_mode = 'read_only'` — see
 * `public.expire_pro_trials()` and the school-shell banner in
 * `apps/web/app/(school)/app/layout.tsx`. §7's fuller `runSubscriptionJobs`
 * response shape (`remindersSent`, `pastDue`, `lapsed`, `downgradesApplied`)
 * belongs to Parts 5-8 (renewal, dunning, downgrade scheduling), which are
 * not built yet.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  // Fail closed: an unset secret authorizes nobody, ever — never fall back to
  // "no check" just because the env var is missing.
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

async function tick(request: Request): Promise<Response> {
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

export async function GET(request: Request): Promise<Response> {
  return tick(request)
}

export async function POST(request: Request): Promise<Response> {
  return tick(request)
}
