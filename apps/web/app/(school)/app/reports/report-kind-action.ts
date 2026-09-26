import type { ReportKind } from "@acadigma/contracts"
import type { Action } from "@acadigma/domain"

/** One `can()` action per report kind (spec §2), shared by `createReportRun`
 * and the download route. Extend as new kinds ship. */
export const ACTION_FOR_KIND: Record<ReportKind, Action> = {
  sample: "report.render.sample",
  report_card: "report.render.report_card",
  report_card_bulk: "report.render.report_card_bulk",
}
