"use server"

/**
 * F-AC-06 Part 1 §7 — `seedBdGradeScale` and `upsertGradeScale` (here
 * `saveGradeScale`: Part 1 edits an existing scale; creating a second scale
 * waits for exams, which is when a scale gets snapshotted and versioned).
 * parse -> context -> policy (`grading.policy.write`) -> requireWritable ->
 * domain coverage check -> repository RPC -> revalidate.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  planReadOnlyApiError,
  saveGradeScaleInputSchema,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { requireWritable, type WorkspaceContext } from "@acadigma/db"
import {
  saveGradeScale as saveGradeScaleRepo,
  seedBdGradeScale as seedBdGradeScaleRepo,
} from "@acadigma/db/repositories/grading"
import { can } from "@acadigma/domain"
import { checkCoverage } from "@acadigma/domain/grading"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const GRADING_PATH = "/app/settings/academics/grading"

type Gate = Result<
  { ctx: WorkspaceContext; supabase: Awaited<ReturnType<typeof createClient>> },
  ApiError
>

async function gateWrite(): Promise<Gate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "grading.policy.write")) {
    return err(
      apiError("forbidden", "Only an owner or admin can change grading.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

export async function seedBdGradeScale(): Promise<
  Result<{ scaleId: string }, ApiError>
> {
  const gate = await gateWrite()
  if (!gate.ok) return gate
  const result = await seedBdGradeScaleRepo(gate.data.ctx, gate.data.supabase)
  if (result.ok) revalidatePath(GRADING_PATH)
  return result
}

export async function saveGradeScale(
  input: unknown
): Promise<Result<{ scaleId: string }, ApiError>> {
  const parsed = saveGradeScaleInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate

  const issue = checkCoverage(parsed.data.bands)
  if (issue) {
    return err(
      apiError(
        "validation_failed",
        issue.code === "BAND_GAP"
          ? "The bands must cover every mark from 0 to 100 with no gap."
          : "Two bands cover the same mark.",
        { fieldErrors: { bands: [issue.code] } }
      )
    )
  }

  const result = await saveGradeScaleRepo(
    gate.data.ctx,
    gate.data.supabase,
    parsed.data
  )
  if (result.ok) revalidatePath(GRADING_PATH)
  return result
}
