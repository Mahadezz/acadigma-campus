"use server"

/**
 * F-AC-04 Part 1 (D-214) — staff self check-in and check-out. No input: the
 * workspace comes from the verified session context and the time, date and
 * status are the database's (`public.staff_check_in` / `staff_check_out` take
 * nothing else). Shape: context -> `can("staff_attendance.self")` ->
 * `requireWritable` -> repository. The database re-checks membership and role.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  err,
  planReadOnlyApiError,
  type ApiError,
  type Result,
  type StaffAttendanceRecord,
} from "@acadigma/contracts"
import {
  requireWritable,
  staffCheckIn,
  staffCheckOut,
  type WorkspaceContext,
} from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

async function gateWrite(): Promise<
  Result<
    {
      ctx: WorkspaceContext
      supabase: Awaited<ReturnType<typeof createClient>>
    },
    ApiError
  >
> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "staff_attendance.self")) {
    return err(apiError("forbidden", "Only school staff can check in."))
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

function refresh() {
  // The card is on both landing screens.
  revalidatePath("/app/dashboard")
  revalidatePath("/app/home")
}

export async function checkInToday(): Promise<
  Result<StaffAttendanceRecord, ApiError>
> {
  const gate = await gateWrite()
  if (!gate.ok) return gate
  const result = await staffCheckIn(gate.data.ctx, gate.data.supabase)
  if (result.ok) refresh()
  return result
}

export async function checkOutToday(): Promise<
  Result<StaffAttendanceRecord, ApiError>
> {
  const gate = await gateWrite()
  if (!gate.ok) return gate
  const result = await staffCheckOut(gate.data.ctx, gate.data.supabase)
  if (result.ok) refresh()
  return result
}
