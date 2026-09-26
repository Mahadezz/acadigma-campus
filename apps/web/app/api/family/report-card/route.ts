/**
 * F-AC-10 results tab (D-306) — `GET /api/family/report-card?examId&studentId`:
 * a parent downloads their own child's published report card.
 *
 * Shape: parse -> context -> policy (`family.results.read`, parents only) ->
 * the report-card seam (`getReportCardData`) through the parent's own RLS
 * client, which only ever returns a published, non-withheld result of a
 * child they are actively linked to — so it renders the frozen payload, and
 * any other id is `not_found`, the same as one that does not exist. Nothing
 * is written: no report_runs row, so a read-only school's parents can still
 * download.
 */
import { NextResponse } from "next/server"

import { apiError, httpStatusForError, uuidSchema } from "@acadigma/contracts"
import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { renderHeaderLine } from "@acadigma/domain/settings"
import { renderPdfToBuffer, ReportCardDocument } from "@acadigma/pdf"

import { getReportCardData } from "@/app/(school)/app/reports/report-card-data"
import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function fail(error: ReturnType<typeof apiError>): Response {
  return NextResponse.json(
    { error },
    { status: httpStatusForError(error.code) }
  )
}

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams
  const examId = uuidSchema.safeParse(query.get("examId"))
  const studentId = uuidSchema.safeParse(query.get("studentId"))
  if (!examId.success || !studentId.success) {
    return fail(
      apiError("validation_failed", "That report card link is not valid.")
    )
  }

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "family.results.read")) {
    return fail(apiError("forbidden", "Only a parent can download this here."))
  }

  const supabase = await createClient()
  const data = await getReportCardData(
    supabase,
    ctx,
    studentId.data,
    examId.data
  )
  if (!data.ok) return fail(data.error)

  const { locale } = await getMessages()
  const profile = await getSchoolProfile(supabase, ctx)
  const buffer = await renderPdfToBuffer(
    ReportCardDocument({
      locale,
      schoolName: profile.ok ? (profile.data.fields.legal_name ?? "") : "",
      headerLines: profile.ok
        ? [
            profile.data.branding.header_line_1,
            profile.data.branding.header_line_2,
          ]
            .filter((line): line is string => Boolean(line))
            .map((line) => renderHeaderLine(line, profile.data.fields))
        : [],
      accentColor: profile.ok ? profile.data.branding.accent : null,
      footerNote: profile.ok ? profile.data.branding.report_footer : null,
      ...data.data,
      generatedAt: new Date(),
    })
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="report-card-${data.data.studentCode}.pdf"`,
      "cache-control": "private, no-store",
    },
  })
}
