import {
  apiError,
  err,
  ok,
  type ApiError,
  type ReportCardBulkParams,
  type ReportCardDto,
  type ReportLocale,
  type Result,
} from "@acadigma/contracts"
import type { AcadigmaSupabaseClient, WorkspaceContext } from "@acadigma/db"
import {
  mergeReportCardBulkPdf,
  renderPdfToBuffer,
  ReportCardDocument,
  type ReportCardDocumentProps,
} from "@acadigma/pdf"

import {
  getReportCardBulkStudentIds,
  getReportCardData,
} from "./report-card-data"

export type ReportCardBulkItemResult =
  | { studentId: string; status: "ready"; pageFrom: number; pageTo: number }
  | { studentId: string; status: "failed"; errorDetail: string }

export type ReportCardBulkRenderResult = {
  buffer: Buffer
  pageCount: number
  /** One entry per student in the roster, success or failure (§4 W2: a
   * failed student is excluded from the merged PDF and named, not silently
   * dropped). */
  items: readonly ReportCardBulkItemResult[]
}

type Branding = Pick<
  ReportCardDocumentProps,
  "schoolName" | "headerLines" | "accentColor" | "footerNote" | "logoImage"
>

/**
 * F-OP-03 Part 5 (bulk report cards, demo cut) — D-207.
 *
 * Resolves a section's roster (`getReportCardBulkStudentIds`), fetches each
 * student's `ReportCardDto` through `getReportCardData` — THE seam, called
 * once per student, exactly as the single-card path (D-206) already does —
 * renders each to its own single-document PDF, sorts by the requested
 * order, and merges with duplex padding (`mergeReportCardBulkPdf`,
 * `packages/pdf`). A student whose data lookup or render throws is recorded
 * as a `failed` item and excluded from the merge; the run still succeeds
 * for every other student (§4 W2 "a failed student fails only their item").
 *
 * Synchronous, like every kind this pipeline has shipped so far (D-205) —
 * no chunking, no drainer, no Realtime progress. Shared by the render step
 * (`actions.ts`) and the download route (`/api/pdf/[runId]`) so the merge/
 * duplex/ordering logic exists in exactly one place.
 */
export async function renderReportCardBulkPdf(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  params: ReportCardBulkParams,
  locale: ReportLocale,
  branding: Branding,
  generatedAt: Date
): Promise<Result<ReportCardBulkRenderResult, ApiError>> {
  const roster = await getReportCardBulkStudentIds(
    supabase,
    ctx,
    params.sectionId,
    params.examId
  )
  if (!roster.ok) return roster

  const rendered: { studentId: string; buffer: Buffer; dto: ReportCardDto }[] =
    []
  const failed: Extract<ReportCardBulkItemResult, { status: "failed" }>[] = []

  for (const studentId of roster.data) {
    const data = await getReportCardData(
      supabase,
      ctx,
      studentId,
      params.examId
    )
    if (!data.ok) {
      failed.push({
        studentId,
        status: "failed",
        errorDetail: data.error.message,
      })
      continue
    }
    try {
      const buffer = await renderPdfToBuffer(
        ReportCardDocument({
          locale,
          ...branding,
          ...data.data,
          generatedAt,
        })
      )
      rendered.push({ studentId, buffer, dto: data.data })
    } catch (renderError) {
      failed.push({
        studentId,
        status: "failed",
        errorDetail:
          renderError instanceof Error
            ? renderError.message
            : "Unknown render error",
      })
    }
  }

  if (rendered.length === 0) {
    return err(
      apiError(
        "not_found",
        "No student in this section has report card data yet."
      )
    )
  }

  const sorted = [...rendered].sort((a, b) => {
    if (params.order === "name") {
      const nameA = locale === "bn" ? a.dto.studentNameBn : a.dto.studentNameEn
      const nameB = locale === "bn" ? b.dto.studentNameBn : b.dto.studentNameEn
      return nameA.localeCompare(nameB)
    }
    return a.dto.rollNumber - b.dto.rollNumber
  })

  const merged = await mergeReportCardBulkPdf(
    sorted.map((s) => s.buffer),
    params.duplex
  )

  const ready: ReportCardBulkItemResult[] = sorted.map((student, i) => ({
    studentId: student.studentId,
    status: "ready",
    pageFrom: merged.pageRanges[i]!.from,
    pageTo: merged.pageRanges[i]!.to,
  }))

  return ok({
    buffer: merged.buffer,
    pageCount: merged.pageCount,
    items: [...ready, ...failed],
  })
}
