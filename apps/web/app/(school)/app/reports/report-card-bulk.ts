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

/**
 * The failure shape for the whole run (e.g. the roster resolver itself
 * refused, or every student in it failed). `items` still carries every
 * per-student outcome attempted so far, so the caller can write
 * `report_run_items` even when the run as a whole is `failed` — a teacher
 * who cannot read the section at all still gets a run that says why,
 * student by student, not just a bare `no_data` (lead review, 2026-09-26).
 */
export type ReportCardBulkFailure = {
  error: ApiError
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
 * `packages/pdf`). A student whose seam call fails for ANY reason (a result
 * with no papers counted at all — `getReportCard` refuses to print one,
 * D-305 item 9; a missing roll number alone still gets a card) is recorded
 * as a `failed` item carrying the seam's own message, and excluded from the
 * merge; the run still succeeds for every other student (§4 W2 "a failed
 * student fails only their item"). This function never pre-filters the
 * roster before calling the seam — every id `getReportCardBulkStudentIds`
 * returns is attempted, so a student who cannot get a card is named, never
 * silently dropped.
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
): Promise<Result<ReportCardBulkRenderResult, ReportCardBulkFailure>> {
  const roster = await getReportCardBulkStudentIds(
    supabase,
    ctx,
    params.sectionId,
    params.examId
  )
  if (!roster.ok) return err({ error: roster.error, items: [] })

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
    return err({
      error: apiError(
        "not_found",
        "No student in this section has report card data yet."
      ),
      items: failed,
    })
  }

  const sorted = [...rendered].sort((a, b) => {
    const nameA = locale === "bn" ? a.dto.studentNameBn : a.dto.studentNameEn
    const nameB = locale === "bn" ? b.dto.studentNameBn : b.dto.studentNameEn
    if (params.order === "name") return nameA.localeCompare(nameB, locale)
    // rollNumber is nullable (D-305 item 9: a student can have a card with
    // no roll number) — sort them after every rolled student rather than
    // corrupting the comparator with NaN, tie-broken by name.
    const rollA = a.dto.rollNumber ?? Number.MAX_SAFE_INTEGER
    const rollB = b.dto.rollNumber ?? Number.MAX_SAFE_INTEGER
    return rollA - rollB || nameA.localeCompare(nameB, locale)
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
