"use server"

/**
 * F-OP-07 Part 6 (D-211) — the danger zone. Shape per action: parse →
 * workspace context → `can()` (owner only) → repository → revalidate. The
 * database functions re-check owner-only and the typed name themselves.
 *
 * No `requireWritable` (EXEMPT in scripts/check-require-writable.mjs): a
 * school on a read-only plan, or one that is archived, must still be able to
 * leave — archive, unarchive, schedule or cancel its own deletion (D-300's
 * "reads, exports, billing and removing access always work", D-211).
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  confirmNameInputSchema,
  err,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import {
  archiveWorkspace,
  cancelWorkspaceDeletion,
  scheduleWorkspaceDeletion,
  unarchiveWorkspace,
  type AcadigmaSupabaseClient,
  type WorkspaceContext,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const FORBIDDEN = apiError("forbidden", "Only the school's owner can do this.")

type Gate =
  | { ok: false; error: ApiError }
  | { ok: true; ctx: WorkspaceContext; supabase: AcadigmaSupabaseClient }

async function ownerGate(): Promise<Gate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "settings.manage")) return { ok: false, error: FORBIDDEN }
  return { ok: true, ctx, supabase: await createClient() }
}

function done<T>(result: Result<T, ApiError>): Result<T, ApiError> {
  // The shell's banners read the school's state on every page.
  if (result.ok) revalidatePath("/app", "layout")
  return result
}

export async function archiveSchool(
  input: unknown
): Promise<Result<void, ApiError>> {
  const parsed = confirmNameInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const g = await ownerGate()
  if (!g.ok) return err(g.error)
  return done(
    await archiveWorkspace(g.ctx, g.supabase, parsed.data.confirmName)
  )
}

export async function unarchiveSchool(
  input: unknown
): Promise<Result<void, ApiError>> {
  const parsed = confirmNameInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const g = await ownerGate()
  if (!g.ok) return err(g.error)
  return done(
    await unarchiveWorkspace(g.ctx, g.supabase, parsed.data.confirmName)
  )
}

export async function scheduleSchoolDeletion(
  input: unknown
): Promise<Result<{ deletionScheduledAt: string }, ApiError>> {
  const parsed = confirmNameInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const g = await ownerGate()
  if (!g.ok) return err(g.error)
  return done(
    await scheduleWorkspaceDeletion(g.ctx, g.supabase, parsed.data.confirmName)
  )
}

export async function cancelSchoolDeletion(): Promise<Result<void, ApiError>> {
  const g = await ownerGate()
  if (!g.ok) return err(g.error)
  return done(await cancelWorkspaceDeletion(g.ctx, g.supabase))
}
