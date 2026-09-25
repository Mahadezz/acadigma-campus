/**
 * F-OP-03 §7 `GET /api/pdf/[runId]` — Parts 1-2: the `'sample'` kind only.
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

import { apiError, httpStatusForError, uuidSchema } from "@acadigma/contracts"
import { getReportRun } from "@acadigma/db/repositories/reports"
import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { renderHeaderLine } from "@acadigma/domain/settings"
import { renderPdfToBuffer, SampleDocument } from "@acadigma/pdf"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

  const buffer = await renderPdfToBuffer(
    SampleDocument({
      locale: run.data.locale,
      schoolName,
      headerLines,
      accentColor,
      footerNote,
      generatedAt: new Date(run.data.completedAt ?? run.data.requestedAt),
    })
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="sample-report-${runId}.pdf"`,
      "cache-control": "private, no-store",
    },
  })
}
