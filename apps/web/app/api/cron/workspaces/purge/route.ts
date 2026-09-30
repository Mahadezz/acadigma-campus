import { NextResponse } from "next/server"

import { httpStatusForError } from "@acadigma/contracts"
import { purgeDueWorkspaces, withServiceRole } from "@acadigma/db"

import { isCronAuthorized } from "@/lib/cron-auth"
import { requestLogger } from "@/lib/logger"

/**
 * F-OP-07 Part 6 (D-211): the daily purge of schools whose 30-day deletion
 * grace has ended. Vercel Cron calls it with `GET` and the `CRON_SECRET`
 * bearer. Each school is deleted by `public.purge_due_workspace` (service
 * role only, one transaction per school), which re-checks the date itself.
 * Logs and returns ids only — never a school's name.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
// D-211: each school's delete cascades through every tenant table; the
// repository deletes at most PURGE_PER_RUN (5) schools per run to stay inside
// this budget (the same 60 s the PDF route already deploys with). The rest
// wait for the next daily run, oldest first.
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  const noStore = { "cache-control": "no-store" }
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: noStore }
    )
  }

  const result = await withServiceRole(
    "workspace-purge: delete schools whose 30-day deletion grace has ended",
    (client) => purgeDueWorkspaces(client)
  )

  const log = await requestLogger({ route: "cron.workspaces.purge" })
  if (!result.ok) {
    log.error({ code: result.error.code }, "workspace purge failed")
    return NextResponse.json(
      { error: result.error.message },
      { status: httpStatusForError(result.error.code), headers: noStore }
    )
  }
  if (result.data.failed.length > 0) {
    log.error({ failed: result.data.failed }, "some workspaces were not purged")
  }
  log.info({ purged: result.data.purged }, "workspace purge ran")
  return NextResponse.json(result.data, { headers: noStore })
}
