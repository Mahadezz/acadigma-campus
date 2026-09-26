/**
 * F-AC-10 results tab (D-306) — `GET /api/family/report-card?examId&studentId`:
 * a parent downloads their own child's published report card.
 *
 * Shape: parse -> context -> the family path (`public.family_results`, D-109):
 * only a published, non-withheld result of a child the caller has an active
 * guardian link to, whatever their role — a staff member who is also a parent
 * gets their own child's card here and nothing their staff access would
 * otherwise show. It renders the frozen payload; any other id is `not_found`,
 * the same as one that does not exist. Nothing is written: no report_runs
 * row, so a read-only school's parents can still download.
 */
import { NextResponse } from "next/server"

import { apiError, httpStatusForError, uuidSchema } from "@acadigma/contracts"
import { listFamilyResults } from "@acadigma/db/repositories/results"
import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { renderHeaderLine } from "@acadigma/domain/settings"
import { renderPdfToBuffer, ReportCardDocument } from "@acadigma/pdf"

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
  const supabase = await createClient()
  const results = await listFamilyResults(ctx, supabase)
  if (!results.ok) return fail(results.error)
  const row = results.data.find(
    (r) => r.examId === examId.data && r.studentId === studentId.data
  )
  if (!row || row.withheld) {
    return fail(apiError("not_found", "That report card was not found."))
  }

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
      ...row.card,
      generatedAt: new Date(),
    })
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="report-card-${row.card.studentCode.replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`,
      "cache-control": "private, no-store",
    },
  })
}
