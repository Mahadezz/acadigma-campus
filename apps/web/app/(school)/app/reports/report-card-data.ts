import {
  apiError,
  err,
  ok,
  type ApiError,
  type Result,
  type ReportCardDto,
} from "@acadigma/contracts"

import {
  buildClass6KaReportCards,
  FIXTURE_EXAM_ID,
  FIXTURE_STUDENT_IDS,
} from "./report-card-fixture"

/**
 * F-OP-03 Part 3 (D-206) — THE SEAM.
 *
 * This is the one function the report-card render path calls for academic
 * data. Today it looks a student up in the Class 6-ক fixture
 * (`report-card-fixture.ts`) because F-AC-06's marks entry (Part 3, being
 * built in the billing lane right now) is not on `main` — there is no
 * `marks`/`results` table to query yet.
 *
 * When that Part merges, replace this function's body with the real query
 * (`app.compute_exam_result(studentId, examId)` per spec §5.1) and delete
 * `report-card-fixture.ts`. The signature — `(studentId, examId) =>
 * Result<ReportCardDto, ApiError>` — does not need to change: `ReportCardDto`
 * already carries only computed academic data (no grade-band logic, §5.1),
 * and `ReportCardParams` (`packages/contracts`) already takes real uuids.
 * Every caller (`actions.ts`'s render step, `/api/pdf/[runId]`) goes through
 * this one function, so the swap is a one-file change.
 */
export async function getReportCardData(
  studentId: string,
  examId: string
): Promise<Result<ReportCardDto, ApiError>> {
  if (examId !== FIXTURE_EXAM_ID) {
    return err(
      apiError(
        "not_found",
        "This exam has no report card data yet (fixture-only in this Part)."
      )
    )
  }
  const index = FIXTURE_STUDENT_IDS.indexOf(studentId)
  if (index === -1) {
    return err(apiError("not_found", "This student is not in the fixture."))
  }
  const dto = buildClass6KaReportCards()[index]
  if (!dto)
    return err(apiError("not_found", "This student is not in the fixture."))
  return ok(dto)
}
