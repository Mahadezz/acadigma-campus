"use server"

/**
 * F-AC-06 Part 3 (demo cut, D-304) — `saveMarks` (§7). parse → context →
 * policy (`marks.write`) → requireWritable (D-300) → repository → Result.
 * `public.save_marks` re-checks the paper's teacher, the entry window, the
 * class list and every value; invalid rows come back in `rejected`.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  lockExamSubjectInputSchema,
  planReadOnlyApiError,
  saveMarksInputSchema,
  submitExamSubjectInputSchema,
  unlockExamSubjectInputSchema,
  type ApiError,
  type Result,
  type SaveMarksResult,
  type SubmitExamSubjectResult,
} from "@acadigma/contracts"
import { requireWritable } from "@acadigma/db"
import {
  lockExamSubject as lockExamSubjectRepo,
  saveMarks as saveMarksRepo,
  submitExamSubject as submitExamSubjectRepo,
  unlockExamSubject as unlockExamSubjectRepo,
} from "@acadigma/db/repositories/marks"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export async function saveMarks(
  input: unknown
): Promise<Result<SaveMarksResult, ApiError>> {
  const parsed = saveMarksInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "marks.write")) {
    return err(
      apiError("forbidden", "You cannot enter marks.", {
        fieldErrors: { _root: ["NOT_ASSIGNED"] },
      })
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await saveMarksRepo(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath("/app/exams", "layout")
  return result
}

/**
 * F-AC-06 Part 4 (D-307) — §7 `submitExamSubject`. parse → context →
 * policy (`marks.write`) → requireWritable → `public.submit_exam_subject`,
 * which checks the paper's teacher or owner/admin. `submitted: false` is
 * the INCOMPLETE_ENTRY warning: nothing changed, `missing` lists who.
 */
export async function submitExamSubject(
  input: unknown
): Promise<Result<SubmitExamSubjectResult, ApiError>> {
  const parsed = submitExamSubjectInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "marks.write")) {
    return err(
      apiError("forbidden", "You cannot submit marks.", {
        fieldErrors: { _root: ["NOT_ASSIGNED"] },
      })
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await submitExamSubjectRepo(
    ctx,
    supabase,
    parsed.data.examSubjectId,
    parsed.data.confirmIncomplete
  )
  if (result.ok && result.data.submitted) {
    revalidatePath("/app/exams", "layout")
    revalidatePath(`/app/marks/${parsed.data.examSubjectId}`)
  }
  return result
}

async function gateLock(): Promise<
  Result<
    {
      ctx: Awaited<ReturnType<typeof requireWorkspace>>
      supabase: Awaited<ReturnType<typeof createClient>>
    },
    ApiError
  >
> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "marks.lock")) {
    return err(
      apiError("forbidden", "Only an owner or admin can lock or unlock marks.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

/** §7 `lockExamSubject` (owner/admin, D-307): submitted → locked. */
export async function lockExamSubject(
  input: unknown
): Promise<Result<void, ApiError>> {
  const parsed = lockExamSubjectInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const gate = await gateLock()
  if (!gate.ok) return gate

  const result = await lockExamSubjectRepo(
    gate.data.ctx,
    gate.data.supabase,
    parsed.data.examSubjectId
  )
  if (result.ok) revalidatePath("/app/exams", "layout")
  return result
}

/**
 * §7 `unlockExamSubject` (owner/admin, D-307): locked → submitted with a
 * reason; a marks_locked exam goes back to marks entry and its results are
 * cleared (audited).
 */
export async function unlockExamSubject(
  input: unknown
): Promise<Result<void, ApiError>> {
  const parsed = unlockExamSubjectInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const gate = await gateLock()
  if (!gate.ok) return gate

  const result = await unlockExamSubjectRepo(
    gate.data.ctx,
    gate.data.supabase,
    parsed.data.examSubjectId,
    parsed.data.reason
  )
  if (result.ok) revalidatePath("/app/exams", "layout")
  return result
}
