"use server"

/**
 * F-ID-03 Part 6 (D-111) — custom-label CRUD (§4.8). Shape per action:
 * parse → workspace context → `can("labels.write")` → `requireWritable`
 * (D-300) → repository → revalidate. `custom_labels` RLS re-checks owner/admin.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  createCustomLabelInputSchema,
  deleteCustomLabelInputSchema,
  err,
  planReadOnlyApiError,
  updateCustomLabelInputSchema,
  type ApiError,
  type CustomLabel,
  type Result,
} from "@acadigma/contracts"
import {
  createCustomLabel as createRow,
  deleteCustomLabel as deleteRow,
  requireWritable,
  updateCustomLabel as updateRow,
  type AcadigmaSupabaseClient,
  type WorkspaceContext,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const FORBIDDEN = apiError(
  "forbidden",
  "Only an owner or an admin can manage labels."
)

type Gate =
  | { ok: false; error: ApiError }
  | { ok: true; ctx: WorkspaceContext; supabase: AcadigmaSupabaseClient }

async function gate(): Promise<Gate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "labels.write")) return { ok: false, error: FORBIDDEN }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) {
    return { ok: false, error: planReadOnlyApiError(writable.error) }
  }
  return { ok: true, ctx, supabase }
}

export async function createCustomLabel(
  input: unknown
): Promise<Result<CustomLabel, ApiError>> {
  const parsed = createCustomLabelInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const g = await gate()
  if (!g.ok) return err(g.error)
  const result = await createRow(g.ctx, g.supabase, parsed.data)
  if (result.ok) revalidatePath("/app/settings/labels")
  return result
}

export async function updateCustomLabel(
  input: unknown
): Promise<Result<CustomLabel, ApiError>> {
  const parsed = updateCustomLabelInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const g = await gate()
  if (!g.ok) return err(g.error)
  const result = await updateRow(g.ctx, g.supabase, parsed.data)
  if (result.ok) revalidatePath("/app/settings/labels")
  return result
}

export async function deleteCustomLabel(
  input: unknown
): Promise<Result<{ id: string }, ApiError>> {
  const parsed = deleteCustomLabelInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const g = await gate()
  if (!g.ok) return err(g.error)
  const result = await deleteRow(g.ctx, g.supabase, parsed.data.id)
  if (result.ok) revalidatePath("/app/settings/labels")
  return result
}
