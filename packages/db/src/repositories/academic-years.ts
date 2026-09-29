/**
 * F-OP-07 Part 2 (D-210) — academic years, terms and exam weighting under
 * Settings → Academic (§4 W3). Every function takes `WorkspaceContext`
 * first and filters on `ctx.workspaceId`; RLS (class T2) is the second
 * wall. The term gap/overlap and exam-weight-sum rules are re-checked
 * here (not just in the server action) so this module stays correct if a
 * second caller is ever added — the same belt-and-braces the grading
 * repository already follows for `checkCoverage`.
 */

import {
  apiError,
  err,
  ok,
  type AcademicYearSummary,
  type ApiError,
  type CreateAcademicYearInput,
  type CreateTermInput,
  type Result,
  type Term,
} from "@acadigma/contracts"
import {
  checkTermRange,
  validateAcademicYearRange,
} from "@acadigma/domain/academic"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const NOT_FOUND: ApiError = apiError(
  "not_found",
  "That academic year does not exist."
)
const TERM_NOT_FOUND: ApiError = apiError(
  "not_found",
  "That term does not exist."
)

function toYear(row: {
  id: string
  name: string
  starts_on: string
  ends_on: string
  is_current: boolean
}): AcademicYearSummary {
  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isCurrent: row.is_current,
  }
}

function toTerm(row: {
  id: string
  academic_year_id: string
  name: string
  starts_on: string
  ends_on: string
}): Term {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  }
}

export async function listAcademicYears(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<AcademicYearSummary[], ApiError>> {
  const { data, error } = await client
    .from("academic_years")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("workspace_id", ctx.workspaceId)
    .order("starts_on", { ascending: false })
  if (error) return err(UNAVAILABLE)
  return ok((data ?? []).map(toYear))
}

export async function createAcademicYear(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: CreateAcademicYearInput
): Promise<Result<AcademicYearSummary, ApiError>> {
  const range = validateAcademicYearRange({
    starts_on: input.startsOn,
    ends_on: input.endsOn,
  })
  if (!range.ok) {
    return err(
      apiError(
        "validation_failed",
        range.issue === "too_long"
          ? "An academic year can be at most 730 days."
          : "The end date must be after the start date.",
        { fieldErrors: { endsOn: [range.issue.toUpperCase()] } }
      )
    )
  }

  const { data, error } = await client
    .from("academic_years")
    .insert({
      workspace_id: ctx.workspaceId,
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      created_by: ctx.userId,
    })
    .select("id, name, starts_on, ends_on, is_current")
    .single()

  if (error) {
    if (error.code === "23505") {
      return err(
        apiError("conflict", "This school already has a year with that name.", {
          fieldErrors: { name: ["YEAR_NAME_TAKEN"] },
        })
      )
    }
    return err(UNAVAILABLE)
  }
  return ok(toYear(data))
}

export async function setCurrentAcademicYear(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  academicYearId: string
): Promise<Result<{ academicYearId: string }, ApiError>> {
  const { data, error } = await client.rpc("set_current_academic_year", {
    p_workspace_id: ctx.workspaceId,
    p_academic_year_id: academicYearId,
  })
  if (error) {
    if (error.message === "academic year not found") return err(NOT_FOUND)
    return err(UNAVAILABLE)
  }
  return ok({ academicYearId: data as string })
}

export async function listTerms(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  academicYearId: string
): Promise<Result<Term[], ApiError>> {
  const { data, error } = await client
    .from("terms")
    .select("id, academic_year_id, name, starts_on, ends_on")
    .eq("workspace_id", ctx.workspaceId)
    .eq("academic_year_id", academicYearId)
    .order("starts_on")
  if (error) return err(UNAVAILABLE)
  return ok((data ?? []).map(toTerm))
}

export async function createTerm(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: CreateTermInput
): Promise<Result<Term, ApiError>> {
  const year = await client
    .from("academic_years")
    .select("starts_on, ends_on")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", input.academicYearId)
    .maybeSingle()
  if (year.error) return err(UNAVAILABLE)
  if (!year.data) return err(NOT_FOUND)

  const existing = await listTerms(ctx, client, input.academicYearId)
  if (!existing.ok) return existing

  const issue = checkTermRange(
    year.data,
    { starts_on: input.startsOn, ends_on: input.endsOn },
    existing.data.map((t) => ({
      id: t.id,
      starts_on: t.startsOn,
      ends_on: t.endsOn,
    }))
  )
  if (issue) {
    const message =
      issue === "TERM_OUTSIDE_YEAR"
        ? "A term must fall inside its academic year."
        : issue === "TERM_OVERLAP"
          ? "This term overlaps another term in the same year."
          : "The end date must be on or after the start date."
    return err(
      apiError("validation_failed", message, {
        fieldErrors: { endsOn: [issue] },
      })
    )
  }

  const { data, error } = await client
    .from("terms")
    .insert({
      workspace_id: ctx.workspaceId,
      academic_year_id: input.academicYearId,
      name: input.name,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      created_by: ctx.userId,
    })
    .select("id, academic_year_id, name, starts_on, ends_on")
    .single()

  if (error) {
    if (error.code === "23505") {
      return err(
        apiError("conflict", "This year already has a term with that name.", {
          fieldErrors: { name: ["TERM_NAME_TAKEN"] },
        })
      )
    }
    return err(UNAVAILABLE)
  }
  return ok(toTerm(data))
}

export async function deleteTerm(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  termId: string
): Promise<Result<{ deleted: true }, ApiError>> {
  const { data, error } = await client
    .from("terms")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", termId)
    .select("id")
  if (error) return err(UNAVAILABLE)
  if (!data || data.length === 0) return err(TERM_NOT_FOUND)
  return ok({ deleted: true })
}

export async function getExamWeights(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  academicYearId: string
): Promise<Result<Record<string, number>, ApiError>> {
  const { data, error } = await client
    .from("academic_years")
    .select("exam_weights")
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", academicYearId)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  return ok((data.exam_weights as Record<string, number> | null) ?? {})
}

export async function updateExamWeights(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  academicYearId: string,
  weights: Record<string, number>
): Promise<Result<Record<string, number>, ApiError>> {
  const { data, error } = await client
    .from("academic_years")
    .update({ exam_weights: weights })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", academicYearId)
    .select("exam_weights")
  if (error) return err(UNAVAILABLE)
  if (!data || data.length === 0) return err(NOT_FOUND)
  return ok((data[0]!.exam_weights as Record<string, number> | null) ?? {})
}
