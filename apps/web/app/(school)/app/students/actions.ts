"use server"

/**
 * F-AC-02 demo cut (D-103) — `quickAdmitStudent` (§7). Shape: parse →
 * workspace context → `can()` → `requireWritable` (D-300) → repository →
 * revalidate. `public.admit_student` re-checks the role and every rule.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  planReadOnlyApiError,
  quickAdmitInputSchema,
  type ApiError,
  type QuickAdmitResult,
  type Result,
} from "@acadigma/contracts"
import { admitStudent, requireWritable } from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export async function quickAdmitStudent(
  input: unknown
): Promise<Result<QuickAdmitResult, ApiError>> {
  const parsed = quickAdmitInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "students.write")) {
    return err(
      apiError("forbidden", "Only an owner or admin can admit students.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await admitStudent(supabase, ctx, parsed.data)
  if (result.ok) revalidatePath("/app/students")
  return result
}
