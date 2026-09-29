"use server"

/**
 * F-OP-07 Part 2 (D-210) — `createAcademicYear`, `setCurrentAcademicYear`,
 * `createTerm`, `deleteTerm`, `updateExamWeights` (§7, §4 W3). Shape follows
 * CLAUDE.md rule 5: parse -> resolve context -> policy
 * (`workspace.settings.write`, the same permission `updateSchoolProfile`
 * uses) -> requireWritable -> domain + repository -> revalidate -> Result.
 * Pass mark / GPA rule / rank / grade-scale-code ("Rules") reuse the
 * existing `updateSchoolSettings` action (`../actions.ts`) unchanged — they
 * already patch `school_profiles.academic_settings`; this file only adds
 * what that action does not cover: years, terms and per-year exam weights.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  createAcademicYearInputSchema,
  createTermInputSchema,
  deleteTermInputSchema,
  err,
  planReadOnlyApiError,
  setCurrentAcademicYearInputSchema,
  updateExamWeightsInputSchema,
  type AcademicYearSummary,
  type ApiError,
  type Result,
  type Term,
} from "@acadigma/contracts"
import { requireWritable, type WorkspaceContext } from "@acadigma/db"
import {
  createAcademicYear as createAcademicYearRepo,
  createTerm as createTermRepo,
  deleteTerm as deleteTermRepo,
  setCurrentAcademicYear as setCurrentAcademicYearRepo,
  updateExamWeights as updateExamWeightsRepo,
} from "@acadigma/db/repositories/academic-years"
import { can } from "@acadigma/domain"
import { checkExamWeights } from "@acadigma/domain/academic"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const PATH = "/app/settings/academic"

type Gate = Result<
  { ctx: WorkspaceContext; supabase: Awaited<ReturnType<typeof createClient>> },
  ApiError
>

async function gateWrite(): Promise<Gate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "workspace.settings.write")) {
    return err(
      apiError(
        "forbidden",
        "Only an owner or admin can change academic settings."
      )
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

export async function createAcademicYear(
  input: unknown
): Promise<Result<AcademicYearSummary, ApiError>> {
  const parsed = createAcademicYearInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await createAcademicYearRepo(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath(PATH)
  return result
}

/** §4 W3.1: "asks for confirmation naming what changes ... audited." The
 * confirmation copy lives in the client component; this action is the
 * confirmed write. */
export async function setCurrentAcademicYear(
  input: unknown
): Promise<Result<{ academicYearId: string }, ApiError>> {
  const parsed = setCurrentAcademicYearInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await setCurrentAcademicYearRepo(
    ctx,
    supabase,
    parsed.data.academicYearId
  )
  if (result.ok) revalidatePath(PATH)
  return result
}

export async function createTerm(
  input: unknown
): Promise<Result<Term, ApiError>> {
  const parsed = createTermInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await createTermRepo(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath(PATH)
  return result
}

export async function deleteTerm(
  input: unknown
): Promise<Result<{ deleted: true }, ApiError>> {
  const parsed = deleteTermInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await deleteTermRepo(ctx, supabase, parsed.data.termId)
  if (result.ok) revalidatePath(PATH)
  return result
}

/** §4 W3.3: "saving is blocked unless the sum is 100 (or weighting is
 * off)". Re-checked here (not just in the form) before it ever reaches the
 * repository. */
export async function updateExamWeights(
  input: unknown
): Promise<Result<Record<string, number>, ApiError>> {
  const parsed = updateExamWeightsInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  if (checkExamWeights(parsed.data.weights)) {
    return err(
      apiError(
        "validation_failed",
        "The weights must add up to 100, or be left empty to turn weighting off.",
        { fieldErrors: { weights: ["WEIGHTS_NOT_100"] } }
      )
    )
  }

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await updateExamWeightsRepo(
    ctx,
    supabase,
    parsed.data.academicYearId,
    parsed.data.weights
  )
  if (result.ok) revalidatePath(PATH)
  return result
}
