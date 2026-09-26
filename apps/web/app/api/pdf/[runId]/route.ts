/**
 * F-OP-03 §7 `GET /api/pdf/[runId]` — Parts 1-6: `'sample'`, `'report_card'`
 * (D-206), `'report_card_bulk'` (D-207), `'attendance_register'` and
 * `'mark_sheet'` (D-208).
 *
 * Shape: parse -> resolve context -> policy (`can`) -> fetch the run through
 * the CALLER's own RLS-scoped client (so a cross-tenant `runId` is simply
 * invisible — `getReportRun` returns `not_found`, never a 403 that would
 * confirm the id exists) -> render -> stream.
 *
 * Node runtime, not Edge (`@react-pdf/renderer` needs Node APIs and the font
 * buffers — spec §7). No signed-URL redirect to a stored object: this PR
 * does not add `storage.objects` RLS policies (F-OP-03's own "files/storage"
 * dependency is not built, and inventing that cross-cutting infra here is
 * out of this Part's scope — see the PR description). The route re-renders
 * the same deterministic bytes for a `ready` run instead.
 */
import { NextResponse } from "next/server"

import {
  apiError,
  attendanceRegisterParamsSchema,
  httpStatusForError,
  markSheetParamsSchema,
  reportCardBulkParamsSchema,
  reportCardParamsSchema,
  uuidSchema,
} from "@acadigma/contracts"
import { getAttendanceRegister } from "@acadigma/db/repositories/attendance-register"
import { getReportRun } from "@acadigma/db/repositories/reports"
import { getMarkSheetData } from "@acadigma/db/repositories/results"
import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { renderHeaderLine } from "@acadigma/domain/settings"
import {
  AttendanceRegisterDocument,
  MarkSheetDocument,
  renderPdfToBuffer,
  ReportCardDocument,
  SampleDocument,
} from "@acadigma/pdf"

import { renderReportCardBulkPdf } from "@/app/(school)/app/reports/report-card-bulk"
import { getReportCardData } from "@/app/(school)/app/reports/report-card-data"
import { ACTION_FOR_KIND } from "@/app/(school)/app/reports/report-kind-action"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// F-OP-03 Part 5 (D-207): a report_card_bulk download re-renders and
// re-merges every student in the section (no stored PDF yet — item 11 of
// the Parts 1-2 addendum), the same cost `createReportRun` paid once
// already. Same ceiling as the results preview's `maxDuration`
// (`apps/web/.../exams/[id]/results/page.tsx` — a Server Action's own
// `maxDuration` cannot live in a "use server" file, so `actions.ts` has none
// of its own; a route handler like this one sets its own directly).
export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
): Promise<Response> {
  const { runId } = await params
  const parsedId = uuidSchema.safeParse(runId)
  if (!parsedId.success) {
    const error = apiError(
      "validation_failed",
      "That report link is not valid."
    )
    return NextResponse.json(
      { error },
      { status: httpStatusForError(error.code) }
    )
  }

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "report.view")) {
    const error = apiError("forbidden", "You cannot open reports here.")
    return NextResponse.json(
      { error },
      { status: httpStatusForError(error.code) }
    )
  }

  const supabase = await createClient()
  const run = await getReportRun(supabase, ctx, parsedId.data)
  if (!run.ok) {
    return NextResponse.json(
      { error: run.error },
      { status: httpStatusForError(run.error.code) }
    )
  }

  // Opening the reports area is not enough: the caller must also be allowed
  // to render this run's kind (a report card carries a student's marks).
  if (!can(ctx.role, ACTION_FOR_KIND[run.data.kind])) {
    const error = apiError("forbidden", "You cannot open this report.")
    return NextResponse.json(
      { error },
      { status: httpStatusForError(error.code) }
    )
  }

  if (run.data.status !== "ready") {
    const error = apiError(
      "conflict",
      run.data.status === "failed"
        ? "This report failed to render. Try again."
        : "This report is not ready yet."
    )
    return NextResponse.json(
      { error },
      { status: httpStatusForError(error.code) }
    )
  }

  const profile = await getSchoolProfile(supabase, ctx)
  const schoolName = profile.ok ? (profile.data.fields.legal_name ?? "") : ""
  const headerLines = profile.ok
    ? [profile.data.branding.header_line_1, profile.data.branding.header_line_2]
        .filter((line): line is string => Boolean(line))
        .map((line) => renderHeaderLine(line, profile.data.fields))
    : []
  const accentColor = profile.ok ? profile.data.branding.accent : null
  const footerNote = profile.ok ? profile.data.branding.report_footer : null
  const generatedAt = new Date(run.data.completedAt ?? run.data.requestedAt)
  const branding = { schoolName, headerLines, accentColor, footerNote }

  let buffer: Buffer
  if (run.data.kind === "report_card") {
    const parsedParams = reportCardParamsSchema.safeParse(run.data.params)
    if (!parsedParams.success) {
      // Stored params were validated on insert; bad ones here are our bug.
      const error = apiError("internal", "This report's params are invalid.")
      return NextResponse.json(
        { error },
        { status: httpStatusForError(error.code) }
      )
    }
    const data = await getReportCardData(
      supabase,
      ctx,
      parsedParams.data.studentId,
      parsedParams.data.examId
    )
    if (!data.ok) {
      return NextResponse.json(
        { error: data.error },
        { status: httpStatusForError(data.error.code) }
      )
    }
    buffer = await renderPdfToBuffer(
      ReportCardDocument({
        locale: run.data.locale,
        ...branding,
        ...data.data,
        generatedAt,
      })
    )
  } else if (run.data.kind === "report_card_bulk") {
    const parsedParams = reportCardBulkParamsSchema.safeParse(run.data.params)
    if (!parsedParams.success) {
      const error = apiError("internal", "This report's params are invalid.")
      return NextResponse.json(
        { error },
        { status: httpStatusForError(error.code) }
      )
    }
    const merged = await renderReportCardBulkPdf(
      supabase,
      ctx,
      parsedParams.data,
      run.data.locale,
      branding,
      generatedAt
    )
    if (!merged.ok) {
      return NextResponse.json(
        { error: merged.error.error },
        { status: httpStatusForError(merged.error.error.code) }
      )
    }
    buffer = merged.data.buffer
  } else if (run.data.kind === "attendance_register") {
    const parsedParams = attendanceRegisterParamsSchema.safeParse(
      run.data.params
    )
    if (!parsedParams.success) {
      const error = apiError("internal", "This report's params are invalid.")
      return NextResponse.json(
        { error },
        { status: httpStatusForError(error.code) }
      )
    }
    const data = await getAttendanceRegister(
      supabase,
      ctx,
      parsedParams.data.sectionId,
      parsedParams.data.month
    )
    if (!data.ok) {
      return NextResponse.json(
        { error: data.error },
        { status: httpStatusForError(data.error.code) }
      )
    }
    buffer = await renderPdfToBuffer(
      AttendanceRegisterDocument({
        locale: run.data.locale,
        ...branding,
        ...data.data,
        generatedAt,
      })
    )
  } else if (run.data.kind === "mark_sheet") {
    const parsedParams = markSheetParamsSchema.safeParse(run.data.params)
    if (!parsedParams.success) {
      const error = apiError("internal", "This report's params are invalid.")
      return NextResponse.json(
        { error },
        { status: httpStatusForError(error.code) }
      )
    }
    const data = await getMarkSheetData(
      ctx,
      supabase,
      parsedParams.data.examId,
      parsedParams.data.sectionId
    )
    if (!data.ok) {
      return NextResponse.json(
        { error: data.error },
        { status: httpStatusForError(data.error.code) }
      )
    }
    buffer = await renderPdfToBuffer(
      MarkSheetDocument({
        locale: run.data.locale,
        ...branding,
        ...data.data,
        generatedAt,
      })
    )
  } else {
    buffer = await renderPdfToBuffer(
      SampleDocument({ locale: run.data.locale, ...branding, generatedAt })
    )
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${run.data.kind}-${runId}.pdf"`,
      "cache-control": "private, no-store",
    },
  })
}
