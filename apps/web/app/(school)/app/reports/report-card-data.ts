import {
  apiError,
  err,
  ok,
  reportCardDtoSchema,
  type ApiError,
  type Result,
  type ReportCardDto,
} from "@acadigma/contracts"
import type { AcadigmaSupabaseClient, WorkspaceContext } from "@acadigma/db"
import {
  getReportCard,
  getSectionResults,
} from "@acadigma/db/repositories/results"

/**
 * F-OP-03 Part 3 (D-206) — THE SEAM, now real (F-AC-06 Part 5, D-305).
 *
 * The one function the report-card render path (`actions.ts`,
 * `/api/pdf/[runId]`) calls for academic data. It reads F-AC-06's computed
 * `results` + `result_subject_lines` for (studentId, examId) through the
 * CALLER's own RLS client, never service role: owner/admin/staff read the
 * whole school, a teacher only the sections they are the active class
 * teacher of (`app.can_read_results`), so anyone else's student is
 * `not_found`. The DTO is checked against `reportCardDtoSchema` before the
 * template sees it.
 */
export async function getReportCardData(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  studentId: string,
  examId: string
): Promise<Result<ReportCardDto, ApiError>> {
  const card = await getReportCard(ctx, supabase, studentId, examId)
  if (!card.ok) return card
  const dto = reportCardDtoSchema.safeParse(card.data)
  if (!dto.success) {
    return err(
      apiError("dependency_unavailable", "This result cannot be printed.")
    )
  }
  return ok(dto.data)
}

/**
 * F-OP-03 Part 5 (D-207) — resolves a section's student roster for bulk
 * rendering, real since F-AC-06 Part 5 (D-305, #68) landed. NOT the seam
 * above: it never returns a `ReportCardDto` itself — the bulk render step
 * still calls `getReportCardData` once per id this returns, the same seam
 * every other caller uses.
 *
 * Reads `getSectionResults(ctx, client, examId, sectionId)`
 * (`@acadigma/db/repositories/results`), through the CALLER's own RLS
 * client — the same tenancy/class-teacher scoping `getReportCard` already
 * enforces. `getSectionResults` does NOT filter out a student with no roll
 * number — it is `getReportCardData`/`getReportCard` that refuses to print
 * one (D-305: "a student without a roll number ... has no card to print").
 * This function keeps returning every roster id unfiltered so that refusal
 * reaches `renderReportCardBulkPdf` as a per-student `failed` item (with the
 * seam's own message) rather than the student being silently missing from
 * the run.
 */
export async function getReportCardBulkStudentIds(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string,
  examId: string
): Promise<Result<readonly string[], ApiError>> {
  const results = await getSectionResults(ctx, supabase, examId, sectionId)
  if (!results.ok) return results
  return ok(results.data.rows.map((row) => row.studentId))
}
