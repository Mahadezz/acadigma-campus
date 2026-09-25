import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type CreateHolidayInput,
  type Holiday,
  type Result,
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
  if (error) {
    if (error.code === "42501") {
      return err(apiError("forbidden", "You cannot change this calendar."))
    }
    return err(UNAVAILABLE)
  }
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
  if (error) return err(UNAVAILABLE)
  if (!data || data.length === 0) {
    return err(apiError("not_found", "That holiday no longer exists."))
  }
  return ok({ deleted: true })
}
