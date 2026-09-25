/**
 * F-AC-02 §4.7 bulk import, demo cut (D-106). The batch row keeps the
 * report (RLS: owner/admin only); `public.import_student_batch` admits its
 * valid rows through `public.admit_student`, a chunk per call.
 */

import {
  apiError,
  err,
  importReportSchema,
  ok,
  type ApiError,
  type ImportReport,
  type ImportStatus,
  type Result,
  type StudentImportBatch,
} from "@acadigma/contracts"
import type { ImportExistingStudent } from "@acadigma/domain/academic"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

const NOT_FOUND = apiError("not_found", "That import was not found.")

const IMPORT_ERRORS: Record<string, ApiError> = {
  FORBIDDEN: apiError(
    "forbidden",
    "Only an owner or admin can import students."
  ),
  BATCH_NOT_FOUND: NOT_FOUND,
  BATCH_EXPIRED: apiError(
    "conflict",
    "This preview is more than a day old. Please upload the file again."
  ),
  PLAN_READ_ONLY: apiError(
    "payment_required",
    "This workspace is read-only. Upgrade to make changes."
  ),
}

/** Rows admitted per database call; each call is its own transaction. */
export const IMPORT_CHUNK_SIZE = 100

export async function createImportBatch(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: {
    filename: string
    report: ImportReport
    totals: { total: number; valid: number; error: number }
  }
): Promise<Result<{ batchId: string }, ApiError>> {
  const { data, error } = await supabase
    .from("student_import_batches")
    .insert({
      workspace_id: ctx.workspaceId,
      filename: input.filename,
      total_rows: input.totals.total,
      valid_rows: input.totals.valid,
      error_rows: input.totals.error,
      report: input.report,
      created_by: ctx.userId,
    })
    .select("id")
    .single()
  if (error || !data) return err(UNAVAILABLE)
  return ok({ batchId: data.id })
}

export async function getImportBatch(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  batchId: string
): Promise<Result<StudentImportBatch, ApiError>> {
  const { data, error } = await supabase
    .from("student_import_batches")
    .select(
      "id, filename, status, total_rows, valid_rows, error_rows, created_count, report, created_at, finished_at"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", batchId)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  const report = importReportSchema.safeParse(data.report)
  if (!report.success) return err(UNAVAILABLE)
  return ok({
    id: data.id,
    filename: data.filename,
    status: data.status as ImportStatus,
    totalRows: data.total_rows,
    validRows: data.valid_rows,
    errorRows: data.error_rows,
    createdCount: data.created_count,
    report: report.data,
    createdAt: data.created_at,
    finishedAt: data.finished_at,
  })
}

/** Admits every valid row, a chunk per call, until none is left. Safe to
 * call again after any failure: rows already admitted are skipped. */
export async function runImportBatch(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  batchId: string
): Promise<Result<{ createdCount: number }, ApiError>> {
  // ponytail: 2,000 rows / 100 = at most 20 calls; the bound only stops a
  // runaway loop if the database ever kept reporting rows left.
  for (let call = 0; call < 25; call++) {
    const { data, error } = await supabase.rpc("import_student_batch", {
      p_workspace_id: ctx.workspaceId,
      p_batch_id: batchId,
      p_limit: IMPORT_CHUNK_SIZE,
    })
    if (error) {
      const known = Object.hasOwn(IMPORT_ERRORS, error.message)
        ? IMPORT_ERRORS[error.message]
        : undefined
      return err(known ?? UNAVAILABLE)
    }
    const result = data as { remaining: number; created_count: number }
    if (result.remaining === 0) {
      return ok({ createdCount: result.created_count })
    }
  }
  return err(UNAVAILABLE)
}

/** This year's actively enrolled students, keyed for the preview's
 * "already on the roster" check (`public.student_import_existing`). */
export async function listImportExistingStudents(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<ImportExistingStudent[], ApiError>> {
  const { data, error } = await supabase.rpc("student_import_existing", {
    p_workspace_id: ctx.workspaceId,
  })
  if (error) return err(UNAVAILABLE)
  const rows = (data ?? []) as {
    section_id: string
    name: string
    date_of_birth: string
    student_code: string
  }[]
  return ok(
    rows.map((r) => ({
      sectionId: r.section_id,
      name: r.name,
      dateOfBirth: r.date_of_birth,
      studentCode: r.student_code,
    }))
  )
}
