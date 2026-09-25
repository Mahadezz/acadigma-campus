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
  planReadOnlyApiError,
  saveMarksInputSchema,
  type ApiError,
  type Result,
  type SaveMarksResult,
} from "@acadigma/contracts"
import { requireWritable } from "@acadigma/db"
import { saveMarks as saveMarksRepo } from "@acadigma/db/repositories/marks"
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
