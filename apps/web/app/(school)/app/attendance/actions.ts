"use server"

/**
 * F-AC-03 demo cut (D-104) — `saveAttendanceSession` (§7). Shape: parse →
 * workspace context → `can()` → `requireWritable` (D-300) → repository →
 * revalidate. `public.save_attendance` re-checks the class teacher, the
 * edit window, the school day and the class list.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  planReadOnlyApiError,
  saveAttendanceInputSchema,
  type ApiError,
  type Result,
  type SaveAttendanceResult,
} from "@acadigma/contracts"
import { requireWritable, saveAttendance } from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

export async function saveAttendanceSession(
  input: unknown
): Promise<Result<SaveAttendanceResult, ApiError>> {
  const parsed = saveAttendanceInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  const { queuedFor } = parsed.data
  if (
    queuedFor &&
    (queuedFor.userId !== ctx.userId ||
      queuedFor.workspaceId !== ctx.workspaceId)
  ) {
    // F-ID-11 §5.8: the outbox waits for its own user and workspace.
    return err(
      apiError(
        "conflict",
        "This change belongs to another account or school.",
        {
          fieldErrors: { _root: ["WRONG_ACCOUNT"] },
        }
      )
    )
  }
  if (!can(ctx.role, "attendance.write")) {
    return err(
      apiError("forbidden", "You cannot take attendance here.", {
        fieldErrors: { _root: ["FORBIDDEN"] },
      })
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await saveAttendance(supabase, ctx, parsed.data)
  if (result.ok) {
    revalidatePath("/app/attendance")
    revalidatePath("/app/dashboard")
  }
  return result
}
