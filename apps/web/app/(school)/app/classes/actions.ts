"use server"

/**
 * F-AC-01 demo cut (D-102) — `createSection`, `archiveSection`,
 * `createSubject`, `seedStarterSubjects` (§7), and `setSectionSubjects`
 * (Part 5 demo cut, D-107). Shape: parse → workspace
 * context → `can()` → `requireWritable` (D-300) → repository → revalidate.
 * RLS (T2) and the table triggers re-check every rule below.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  archiveSectionInputSchema,
  createSectionInputSchema,
  createSubjectInputSchema,
  err,
  planReadOnlyApiError,
  setSectionSubjectsInputSchema,
  type ApiError,
  type Result,
  type Section,
} from "@acadigma/contracts"
import {
  archiveSection as archiveSectionRepo,
  createSection as createSectionRepo,
  createSubjects,
  listSubjects,
  requireWritable,
  setSectionSubjects as setSectionSubjectsRepo,
  type WorkspaceContext,
} from "@acadigma/db"
import { can, type Action } from "@acadigma/domain"
import { NCTB_STARTER_SUBJECTS } from "@acadigma/domain/academic"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const CLASSES_PATH = "/app/classes"

type Gate = Result<
  { ctx: WorkspaceContext; supabase: Awaited<ReturnType<typeof createClient>> },
  ApiError
>

async function gateWrite(permission: Action): Promise<Gate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, permission)) {
    return err(
      apiError("forbidden", "Only an owner or admin can change classes.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

export async function createSection(
  input: unknown
): Promise<Result<Section, ApiError>> {
  const parsed = createSectionInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("academics.section.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await createSectionRepo(supabase, ctx, parsed.data)
  if (result.ok) revalidatePath(CLASSES_PATH)
  return result
}

export async function archiveSection(
  input: unknown
): Promise<Result<{ id: string }, ApiError>> {
  const parsed = archiveSectionInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("academics.section.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await archiveSectionRepo(supabase, ctx, parsed.data.sectionId)
  if (result.ok) revalidatePath(CLASSES_PATH)
  return result
}

export async function createSubject(
  input: unknown
): Promise<Result<{ created: number }, ApiError>> {
  const parsed = createSubjectInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("academics.subject.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await createSubjects(supabase, ctx, [parsed.data])
  if (result.ok) revalidatePath(CLASSES_PATH)
  return result
}

/** §3 "Seeds": copies the NCTB starter list into this school, skipping any
 * subject whose name or code the school already has. Safe to run twice. */
export async function seedStarterSubjects(): Promise<
  Result<{ created: number }, ApiError>
> {
  const gate = await gateWrite("academics.subject.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const existing = await listSubjects(supabase, ctx)
  if (!existing.ok) return existing
  const names = new Set(existing.data.map((s) => s.name.toLowerCase()))
  const codes = new Set(existing.data.map((s) => s.code).filter(Boolean))

  const missing = NCTB_STARTER_SUBJECTS.filter(
    (s) => !names.has(s.name.toLowerCase()) && !codes.has(s.code)
  ).map((s) => ({
    name: s.name,
    nameBn: s.name_bn,
    code: s.code,
    category: s.category,
    subjectKind: s.subject_kind,
  }))

  const result = await createSubjects(supabase, ctx, missing)
  if (result.ok) revalidatePath(CLASSES_PATH)
  return result
}

/** §4.3 (demo cut, D-107): the section's subjects and each one's teacher,
 * saved as one list from the section's Subjects sheet. */
export async function setSectionSubjects(
  input: unknown
): Promise<Result<{ count: number }, ApiError>> {
  const parsed = setSectionSubjectsInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite("academics.section.write")
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const result = await setSectionSubjectsRepo(supabase, ctx, parsed.data)
  if (result.ok) revalidatePath(CLASSES_PATH)
  return result
}
