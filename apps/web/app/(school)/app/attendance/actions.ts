"use server"

/**
 * F-AC-03 demo cut (D-104) — `saveAttendanceSession` (§7). Shape: parse →
 * workspace context → `can()` → `requireWritable` (D-300) → repository →
 * revalidate. `public.save_attendance` re-checks the class teacher, the
 * edit window, the school day and the class list.
 */

import { revalidatePath } from "next/cache"

import { z } from "zod"

import {
  apiError,
  apiErrorFromZod,
  err,
  ok,
  planReadOnlyApiError,
  saveAttendanceInputSchema,
  uuidSchema,
  type ApiError,
  type Result,
  type RollCallStudent,
  type SaveAttendanceResult,
} from "@acadigma/contracts"
import {
  getAttendanceDay,
  getRollCall,
  requireWritable,
  saveAttendance,
} from "@acadigma/db"
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

const conflictInputSchema = z
  .object({
    sectionId: uuidSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()

export type AttendanceConflict = {
  /** The colleague's version: the base for "Use mine" / "Save my choices". */
  updatedAt: string
  takenByName: string | null
  students: Pick<
    RollCallStudent,
    "studentId" | "fullName" | "fullNameBn" | "status"
  >[]
}

/**
 * F-ID-11 §4.5 (D-310): the register a queued roll call conflicted with, for
 * the conflict sheet — read with the caller's own session and RLS, exactly
 * what the roll-call page shows them.
 */
export async function getAttendanceConflict(
  input: unknown
): Promise<Result<AttendanceConflict, ApiError>> {
  const parsed = conflictInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "attendance.read") || ctx.role === "parent") {
    return err(apiError("forbidden", "You cannot read attendance here."))
  }
  const supabase = await createClient()
  const { sectionId, date } = parsed.data
  const day = await getAttendanceDay(supabase, ctx, date)
  if (!day.ok) return day
  const session = day.data.sections.find(
    (s) => s.sectionId === sectionId
  )?.session
  if (!session) return err(apiError("not_found", "No register to compare."))
  const students = await getRollCall(supabase, ctx, sectionId, date, session.id)
  if (!students.ok) return students
  return ok({
    updatedAt: session.updatedAt,
    takenByName: session.takenByName,
    students: students.data.map((s) => ({
      studentId: s.studentId,
      fullName: s.fullName,
      fullNameBn: s.fullNameBn,
      status: s.status,
    })),
  })
}
