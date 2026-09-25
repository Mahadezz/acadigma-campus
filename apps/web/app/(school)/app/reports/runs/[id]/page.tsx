import Link from "next/link"
import { forbidden, notFound } from "next/navigation"

import type { ReportStatus } from "@acadigma/contracts"
import { uuidSchema } from "@acadigma/contracts/common"
import { getReportRun } from "@acadigma/db/repositories/reports"
import { can } from "@acadigma/domain"
import {
  StatusChip,
  type ToneStatusChipProps,
} from "@acadigma/ui/primitives/status-chip"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Report run" }

const STATUS_TONE: Record<ReportStatus, ToneStatusChipProps["tone"]> = {
  queued: "pending",
  rendering: "info",
  ready: "positive",
  failed: "negative",
  expired: "neutral",
}

/**
 * Default-variant `Button` classes, inlined rather than imported from
 * `@acadigma/ui/components/button`: that module imports `Slot` from the
 * `radix-ui` package for `asChild`, which is not needed for one plain
 * external link and pulled ~80 kB of unrelated Radix primitives into this
 * route's first-load JS (`scripts/check-bundle-budget.mjs`, 250 kB budget) —
 * `Button`/`buttonVariants` themselves are otherwise untouched (design-lane
 * owned, DESIGN-SYSTEM/LANES.md).
 */
const DOWNLOAD_LINK_CLASSNAME =
  "bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/** F-OP-03 Parts 1-2 — `/app/reports/runs/[id]` (spec §6 "Run detail", trimmed). */
export default async function ReportRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) notFound()

  const ctx = await requireShell("school")
  if (!can(ctx.role, "report.view")) forbidden()

  const { t } = await getMessages()
  const r = t.reports

  const run = await getReportRun(await createClient(), ctx, parsedId.data)
  if (!run.ok) notFound()

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link
        href="/app/reports"
        className="text-muted-foreground text-sm hover:underline"
      >
        {"< "}
        {r.detail.back}
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{r.detail.title}</h2>
        <StatusChip tone={STATUS_TONE[run.data.status]}>
          {r.status[run.data.status]}
        </StatusChip>
      </div>

      <p className="text-muted-foreground text-sm">
        {r.detail.requestedAt}:{" "}
        {new Date(run.data.requestedAt).toLocaleString()}
      </p>

      {run.data.status === "ready" && (
        <a
          href={`/api/pdf/${run.data.id}`}
          target="_blank"
          rel="noreferrer"
          className={DOWNLOAD_LINK_CLASSNAME}
        >
          {r.detail.download}
        </a>
      )}

      {run.data.status === "failed" && (
        <p className="text-danger text-sm">{r.detail.failedNote}</p>
      )}

      {(run.data.status === "queued" || run.data.status === "rendering") && (
        <p className="text-muted-foreground text-sm">{r.detail.notReady}</p>
      )}
    </div>
  )
}
