import { z } from "zod"

import {
  apiError,
  err,
  ok,
  planReadOnlyApiError,
  staffAttendanceStatusSchema,
  type ApiError,
  type Result,
  type StaffAttendanceRecord,
  type StaffCheckInToday,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * F-AC-04 Part 1 (D-214): staff self check-in. Every write goes through
 * `public.staff_check_in` / `staff_check_out` — the table has no write grant
 * and the functions take the workspace id and nothing else, so the time, the
 * date and the status are the database's. Audit rows come from the generic
 * trigger, never from here (CLAUDE.md rule 9).
 */

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/** Database refusals a caller can act on; anything else is "try again". */
function mapError(error: {
  code?: string
  message?: string
  details?: string | null
}): ApiError {
  if (error.code === "42501" && error.message === "PLAN_READ_ONLY") {
    return planReadOnlyApiError({
      code: "PLAN_READ_ONLY",
      reason: error.details ?? null,
    })
  }
  if (error.code === "42501") {
    return apiError("forbidden", "Only school staff can check in.")
  }
  if (error.message === "NOT_SCHOOL_DAY") {
    return apiError("conflict", "There is no school today.")
  }
  if (error.message === "NOT_CHECKED_IN") {
    return apiError("conflict", "Check in first.")
  }
  return UNAVAILABLE
}

const recordSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: staffAttendanceStatusSchema,
  check_in_at: z.string().nullable(),
  check_out_at: z.string().nullable(),
  minutes_late: z.number().nullable(),
})

const todaySchema = z.object({
  today: z.string(),
  is_school_day: z.boolean(),
  record: recordSchema.nullable(),
})

function toRecord(r: z.infer<typeof recordSchema>): StaffAttendanceRecord {
  return {
    id: r.id,
    date: r.date,
    status: r.status,
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    minutesLate: r.minutes_late,
  }
}

/** The caller's own row for the school's today, and whether today is a school day. */
export async function getStaffCheckInToday(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<StaffCheckInToday, ApiError>> {
  const { data, error } = await client.rpc("staff_attendance_today", {
    p_workspace_id: ctx.workspaceId,
  })
  if (error) return err(mapError(error))
  const parsed = todaySchema.safeParse(data)
  if (!parsed.success) return err(UNAVAILABLE)
  return ok({
    today: parsed.data.today,
    isSchoolDay: parsed.data.is_school_day,
    record: parsed.data.record ? toRecord(parsed.data.record) : null,
  })
}

async function callRecordRpc(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  fn: "staff_check_in" | "staff_check_out"
): Promise<Result<StaffAttendanceRecord, ApiError>> {
  const { data, error } = await client.rpc(fn, {
    p_workspace_id: ctx.workspaceId,
  })
  if (error) return err(mapError(error))
  const parsed = recordSchema.safeParse(data)
  return parsed.success ? ok(toRecord(parsed.data)) : err(UNAVAILABLE)
}

/** Idempotent: a second call returns the existing row. */
export function staffCheckIn(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<StaffAttendanceRecord, ApiError>> {
  return callRecordRpc(ctx, client, "staff_check_in")
}

/** Idempotent: the first check-out time stands. */
export function staffCheckOut(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<StaffAttendanceRecord, ApiError>> {
  return callRecordRpc(ctx, client, "staff_check_out")
}
