import Link from "next/link"
import { forbidden } from "next/navigation"

import type { ReportStatus } from "@acadigma/contracts"
import { listReportRuns } from "@acadigma/db/repositories/reports"
import { can } from "@acadigma/domain"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import {
  StatusChip,
  type ToneStatusChipProps,
} from "@acadigma/ui/primitives/status-chip"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { GenerateReportCardBulkButton } from "./generate-report-card-bulk-button"
import { GenerateReportCardButton } from "./generate-report-card-button"
import { GenerateSampleButton } from "./generate-sample-button"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Reports" }

const STATUS_TONE: Record<ReportStatus, ToneStatusChipProps["tone"]> = {
  queued: "pending",
  rendering: "info",
  ready: "positive",
  failed: "negative",
  expired: "neutral",
}

/**
 * F-OP-03 Parts 1-2 — `/app/reports` (spec §6 "Report gallery", trimmed to
 * this Part's scope: no 7-card type gallery yet, only the one report kind
 * this PR's pipeline can render — `'sample'`, the letterhead proof — plus
 * the recent-runs list §8 Part 2 asks for).
 */
export default async function ReportsPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "report.view")) forbidden()

  const { t } = await getMessages()
  const r = t.reports

  const runs = await listReportRuns(await createClient(), ctx)
  const rows = runs.ok ? runs.data : []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{r.title}</h2>
        <p className="text-muted-foreground text-sm">{r.description}</p>
      </div>

      <GenerateSampleButton
        t={{ generate: r.generate, generating: r.generating, error: r.error }}
      />

      {/* D-206: the only report card data is a fixture student, who must never
          appear under a real school — no button in production until the
          seam (`report-card-data.ts`) reads real results. */}
      {process.env.NODE_ENV !== "production" &&
        can(ctx.role, "report.render.report_card") && (
          <GenerateReportCardButton
            t={{
              generateReportCard: r.generateReportCard,
              generating: r.generating,
              error: r.error,
            }}
          />
        )}

      {/* D-207: same fixture-only rule as report_card, for the whole section. */}
      {process.env.NODE_ENV !== "production" &&
        can(ctx.role, "report.render.report_card_bulk") && (
          <GenerateReportCardBulkButton
            t={{
              generateReportCardBulk: r.generateReportCardBulk,
              generating: r.generating,
              error: r.error,
            }}
          />
        )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">{r.recent}</h3>
        {rows.length === 0 ? (
          <EmptyState title={r.empty} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/app/reports/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">
                    {new Date(run.requestedAt).toLocaleString()}
                  </span>
                  <StatusChip tone={STATUS_TONE[run.status]}>
                    {r.status[run.status]}
                  </StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
