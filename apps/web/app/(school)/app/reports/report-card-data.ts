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
import { getReportCard } from "@acadigma/db/repositories/results"

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
