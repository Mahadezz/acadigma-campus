import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
  type ReportCardDto,
} from "@acadigma/contracts"
import type { AcadigmaSupabaseClient, WorkspaceContext } from "@acadigma/db"

import {
  buildClass6KaReportCards,
  FIXTURE_EXAM_ID,
  FIXTURE_STUDENT_IDS,
} from "./report-card-fixture"

/**
 * F-OP-03 Part 3 (D-206) — THE SEAM.
 *
 * The one function the report-card render path calls for academic data.
 * Today it looks a student up in the Class 6-ক fixture
 * (`report-card-fixture.ts`): the `results` / `result_subject_lines` rows
 * that F-AC-06's `app.compute_results(exam_id)` writes are not on `main`
 * yet. The billing lane is building that as F-AC-06 Part 5
 * (`feat/academics-results`) and will implement this seam there.
 *
 * The real body reads `results` + `result_subject_lines` for
 * (studentId, examId) through `supabase` — the CALLER's own RLS-scoped
 * client, never service role — scoped to `ctx.workspaceId`, so a teacher
 * only ever sees what RLS lets them read (class teacher of the section,
 * D-206). It maps one `results` row onto `ReportCardDto` and deletes
 * `report-card-fixture.ts`. Every caller (`actions.ts`, `/api/pdf/[runId]`)
 * goes through here, so the swap is a one-file change.
 */
export async function getReportCardData(
  // Unused by the fixture; the real query reads through them.
  _supabase: AcadigmaSupabaseClient,
  _ctx: WorkspaceContext,
  studentId: string,
  examId: string
): Promise<Result<ReportCardDto, ApiError>> {
  // The fixture student must never print under a real school (D-206).
  if (process.env.NODE_ENV === "production" || examId !== FIXTURE_EXAM_ID) {
    return err(
      apiError(
        "not_found",
        "This exam has no report card data yet (fixture-only in this Part)."
      )
    )
  }
  const index = FIXTURE_STUDENT_IDS.indexOf(studentId)
  const dto = index === -1 ? undefined : buildClass6KaReportCards()[index]
  if (!dto)
    return err(apiError("not_found", "This student is not in the fixture."))
  return ok(dto)
}
