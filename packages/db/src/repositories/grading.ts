import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type GradeScaleDto,
  type Result,
  type SaveGradeScaleInput,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * F-AC-06 Part 1 — grade scales. Reads go through RLS (every active member);
 * writes are the two SECURITY INVOKER RPCs in
 * `20260925300202_grade_scales.sql`, so RLS (owner/admin), the coverage
 * trigger and the require_writable trigger all still apply.
 */

const UNAVAILABLE = apiError(
  "dependency_unavailable",
  "Could not load the grade scales. Try again."
)

const bandRowSchema = z.object({
  letter: z.string(),
  min_percent: z.coerce.number(),
  max_percent: z.coerce.number(),
  grade_point: z.coerce.number(),
  is_fail: z.boolean(),
  sort_order: z.number(),
})

const scaleRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  grade_bands: z.array(bandRowSchema),
})

export async function listGradeScales(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<GradeScaleDto[], ApiError>> {
  const { data, error } = await client
    .from("grade_scales")
    .select(
      "id, code, name, is_default, grade_bands (letter, min_percent, max_percent, grade_point, is_fail, sort_order)"
    )
    .eq("workspace_id", ctx.workspaceId)
    .order("is_default", { ascending: false })
    .order("name")

  if (error) return err(UNAVAILABLE)
  const rows = z.array(scaleRowSchema).safeParse(data ?? [])
  if (!rows.success) return err(UNAVAILABLE)

  return ok(
    rows.data.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isDefault: r.is_default,
      bands: r.grade_bands
        .map((b) => ({
          letter: b.letter,
          minPercent: b.min_percent,
          maxPercent: b.max_percent,
          gradePoint: b.grade_point,
          isFail: b.is_fail,
          sortOrder: b.sort_order,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
  )
}

/** `public.seed_bd_grade_scale` — idempotent; returns the scale id. */
export async function seedBdGradeScale(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<{ scaleId: string }, ApiError>> {
  const { data, error } = await client.rpc("seed_bd_grade_scale", {
    p_workspace_id: ctx.workspaceId,
  })
  if (error || typeof data !== "string") {
    return err(
      apiError("dependency_unavailable", "Could not add the default scale.")
    )
  }
  return ok({ scaleId: data })
}

const SAVE_ERRORS: Record<string, ApiError> = {
  BAND_GAP: apiError(
    "validation_failed",
    "The bands must cover every mark from 0 to 100 with no gap.",
    { fieldErrors: { bands: ["BAND_GAP"] } }
  ),
  BAND_OVERLAP: apiError(
    "validation_failed",
    "Two bands cover the same mark.",
    { fieldErrors: { bands: ["BAND_OVERLAP"] } }
  ),
}

/** `public.save_grade_scale` — renames the scale and replaces its bands atomically. */
export async function saveGradeScale(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: SaveGradeScaleInput
): Promise<Result<{ scaleId: string }, ApiError>> {
  const { data, error } = await client.rpc("save_grade_scale", {
    p_scale_id: input.scaleId,
    p_name: input.name,
    p_bands: input.bands.map((b) => ({
      letter: b.letter,
      min_percent: b.minPercent,
      max_percent: b.maxPercent,
      grade_point: b.gradePoint,
      is_fail: b.isFail,
      sort_order: b.sortOrder,
    })),
  })
  if (error) {
    const known = Object.hasOwn(SAVE_ERRORS, error.message)
      ? SAVE_ERRORS[error.message]
      : undefined
    return err(
      known ??
        (error.code === "P0002"
          ? apiError("not_found", "That grade scale no longer exists.")
          : apiError("dependency_unavailable", "Could not save the scale."))
    )
  }
  return ok({ scaleId: String(data) })
}
