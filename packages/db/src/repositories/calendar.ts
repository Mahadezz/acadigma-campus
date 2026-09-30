import { z } from "zod"

import {
  apiError,
  err,
  ok,
  planReadOnlyApiError,
  type ApiError,
  type CreateHolidayInput,
  type Holiday,
  type Result,
  type UpsertWorkingDayOverrideInput,
  type WorkingDayOverride,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * F-AC-11 Part 1 (D-202): `holidays` reads and writes. Writes are gated by
 * the caller's `can()` check and, independently, by the `holidays_*` RLS
 * policies (owner/admin) and `app.tg_require_writable`. Audit rows come from
 * the generic trigger, never from here (CLAUDE.md rule 9).
 */

const COLUMNS = "id, name, name_bn, kind, source, starts_on, ends_on, note"

/** A school has a few dozen holidays a year; this bounds a runaway list. */
const LIST_LIMIT = 500

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the calendar. Please try again."
)

/**
 * Database refusals a caller can act on: the read-only trigger (`42501`
 * PLAN_READ_ONLY, D-300), an RLS refusal (`42501`), and the duplicate
 * (name, first day) key (`23505`). Anything else is "try again".
 */
function mapWriteError(error: {
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
    return apiError("forbidden", "You cannot change this calendar.")
  }
  if (error.code === "23505") {
    return apiError(
      "conflict",
      "A holiday with this name already starts on that day."
    )
  }
  return UNAVAILABLE
}

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  name_bn: z.string().nullable(),
  kind: z.string(),
  source: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  note: z.string().nullable(),
})

function toHoliday(row: unknown): Holiday {
  const r = rowSchema.parse(row)
  return {
    id: r.id,
    name: r.name,
    nameBn: r.name_bn,
    kind: r.kind as Holiday["kind"],
    source: r.source as Holiday["source"],
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    note: r.note,
  }
}

/** Holidays that end on or after `from`, oldest first. */
export async function listHolidays(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  from: string
): Promise<Result<Holiday[], ApiError>> {
  const { data, error } = await client
    .from("holidays")
    .select(COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .gte("ends_on", from)
    .order("starts_on", { ascending: true })
    .limit(LIST_LIMIT)
  if (error) return err(UNAVAILABLE)
  return ok((data ?? []).map(toHoliday))
}

export async function createHoliday(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: CreateHolidayInput
): Promise<Result<Holiday, ApiError>> {
  const { data, error } = await client
    .from("holidays")
    .insert({
      workspace_id: ctx.workspaceId,
      name: input.name,
      name_bn: input.nameBn ?? null,
      kind: input.kind,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      note: input.note ?? null,
      source: "manual",
    })
    .select(COLUMNS)
    .single()
  if (error) return err(mapWriteError(error))
  return ok(toHoliday(data))
}

export async function deleteHoliday(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  holidayId: string
): Promise<Result<{ deleted: true }, ApiError>> {
  const { data, error } = await client
    .from("holidays")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", holidayId)
    .select("id")
  if (error) return err(mapWriteError(error))
  if (!data || data.length === 0) {
    return err(apiError("not_found", "That holiday no longer exists."))
  }
  return ok({ deleted: true })
}

/**
 * F-AC-11 §4.3: `working_day_overrides`. Same gate as holidays (owner/admin
 * RLS, read-only trigger); audit rows come from the generic trigger.
 */
const OVERRIDE_COLUMNS = "id, date, is_working, reason"

const overrideRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  is_working: z.boolean(),
  reason: z.string(),
})

function toOverride(row: unknown): WorkingDayOverride {
  const r = overrideRowSchema.parse(row)
  return { id: r.id, date: r.date, isWorking: r.is_working, reason: r.reason }
}

/** Overrides on or after `from`, oldest first. */
export async function listWorkingDayOverrides(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  from: string
): Promise<Result<WorkingDayOverride[], ApiError>> {
  const { data, error } = await client
    .from("working_day_overrides")
    .select(OVERRIDE_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .gte("date", from)
    .order("date", { ascending: true })
    .limit(LIST_LIMIT)
  if (error) return err(UNAVAILABLE)
  return ok((data ?? []).map(toOverride))
}

/** One row per (workspace, date): a second save for a date updates it. */
export async function upsertWorkingDayOverride(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: UpsertWorkingDayOverrideInput
): Promise<Result<WorkingDayOverride, ApiError>> {
  const { data, error } = await client
    .from("working_day_overrides")
    .upsert(
      {
        workspace_id: ctx.workspaceId,
        date: input.date,
        is_working: input.isWorking,
        reason: input.reason,
      },
      { onConflict: "workspace_id,date" }
    )
    .select(OVERRIDE_COLUMNS)
    .single()
  if (error) return err(mapWriteError(error))
  return ok(toOverride(data))
}

export async function deleteWorkingDayOverride(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  date: string
): Promise<Result<{ deleted: true }, ApiError>> {
  const { data, error } = await client
    .from("working_day_overrides")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("date", date)
    .select("id")
  if (error) return err(mapWriteError(error))
  if (!data || data.length === 0) {
    return err(apiError("not_found", "That override no longer exists."))
  }
  return ok({ deleted: true })
}
