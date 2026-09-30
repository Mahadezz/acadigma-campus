/**
 * F-OP-07 Part 6 (D-211) — the danger zone. Every write is a SECURITY DEFINER
 * function that re-checks owner-only and the typed school name itself
 * (`20260929213326_danger_zone.sql`); this file only calls them and maps
 * their named refusals. The export reads through `export_workspace_table`,
 * SECURITY INVOKER, so the caller's own RLS decides what leaves.
 */

import { z } from "zod"

import {
  apiError,
  DANGER_ERROR,
  dangerZoneStateSchema,
  err,
  ok,
  type ApiError,
  type DangerZoneState,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "Only the school's owner can do this."
)

function marked(
  code: ApiError["code"],
  message: string,
  marker: string
): ApiError {
  return { ...apiError(code, message), fieldErrors: { _root: [marker] } }
}

/** The database's refusals, by message (SQLSTATE alone is too coarse). */
const KNOWN: Record<string, ApiError> = {
  FORBIDDEN,
  NAME_MISMATCH: marked(
    "validation_failed",
    "Type the school's name exactly as shown.",
    DANGER_ERROR.NAME_MISMATCH
  ),
  ACTIVE_SUBSCRIPTION: marked(
    "conflict",
    "This school has an active paid subscription. Cancel it first.",
    DANGER_ERROR.ACTIVE_SUBSCRIPTION
  ),
  UNPAID_BALANCE: marked(
    "conflict",
    "This school has an unpaid balance. Settle it first.",
    DANGER_ERROR.UNPAID_BALANCE
  ),
  ALREADY_ARCHIVED: marked(
    "conflict",
    "This school is already archived.",
    DANGER_ERROR.ALREADY_ARCHIVED
  ),
  NOT_ARCHIVED: marked(
    "conflict",
    "This school is not archived.",
    DANGER_ERROR.NOT_ARCHIVED
  ),
  ARCHIVE_EXPIRED: marked(
    "conflict",
    "This school was archived more than 12 months ago. Contact support to restore it.",
    DANGER_ERROR.ARCHIVE_EXPIRED
  ),
  ALREADY_SCHEDULED: marked(
    "conflict",
    "This school is already scheduled for deletion.",
    DANGER_ERROR.ALREADY_SCHEDULED
  ),
  NOT_SCHEDULED: marked(
    "conflict",
    "This school is not scheduled for deletion.",
    DANGER_ERROR.NOT_SCHEDULED
  ),
  DELETION_DUE: marked(
    "conflict",
    "The deletion date has passed; it can no longer be cancelled.",
    DANGER_ERROR.DELETION_DUE
  ),
  RATE_LIMITED: marked(
    "rate_limited",
    "You can download a full export three times a day. Try again tomorrow.",
    DANGER_ERROR.RATE_LIMITED
  ),
}

/** W8: a billing refusal names the subscription (the database's DETAIL). */
const BLOCKER_NEXT_STEP: Record<string, string> = {
  ACTIVE_SUBSCRIPTION: "Cancel it first.",
  UNPAID_BALANCE: "Settle it first.",
}

function refusal(error: {
  message: string
  details?: string | null
}): ApiError {
  const known = Object.hasOwn(KNOWN, error.message)
    ? KNOWN[error.message]
    : undefined
  if (!known) return UNAVAILABLE
  const next = Object.hasOwn(BLOCKER_NEXT_STEP, error.message)
    ? BLOCKER_NEXT_STEP[error.message]
    : undefined
  return next && error.details
    ? { ...known, message: `${error.details} ${next}` }
    : known
}

/** Name, status and the lifecycle dates of the current school. */
export async function getDangerZoneState(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<DangerZoneState, ApiError>> {
  const { data, error } = await client
    .from("workspaces")
    .select("name, status, archived_at, deletion_scheduled_at")
    .eq("id", ctx.workspaceId)
    .maybeSingle()
  if (error || !data) return err(UNAVAILABLE)
  const parsed = dangerZoneStateSchema.safeParse({
    name: data.name,
    status: data.status,
    archivedAt: data.archived_at,
    deletionScheduledAt: data.deletion_scheduled_at,
  })
  return parsed.success ? ok(parsed.data) : err(UNAVAILABLE)
}

export async function archiveWorkspace(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  confirmName: string
): Promise<Result<void, ApiError>> {
  const { error } = await client.rpc("archive_workspace", {
    p_workspace_id: ctx.workspaceId,
    p_confirm_name: confirmName,
  })
  return error ? err(refusal(error)) : ok(undefined)
}

export async function unarchiveWorkspace(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  confirmName: string
): Promise<Result<void, ApiError>> {
  const { error } = await client.rpc("unarchive_workspace", {
    p_workspace_id: ctx.workspaceId,
    p_confirm_name: confirmName,
  })
  return error ? err(refusal(error)) : ok(undefined)
}

/** Returns the date the school will be deleted (now + 30 days). */
export async function scheduleWorkspaceDeletion(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  confirmName: string
): Promise<Result<{ deletionScheduledAt: string }, ApiError>> {
  const { data, error } = await client.rpc("schedule_workspace_deletion", {
    p_workspace_id: ctx.workspaceId,
    p_confirm_name: confirmName,
  })
  if (error) return err(refusal(error))
  return ok({ deletionScheduledAt: String(data) })
}

export async function cancelWorkspaceDeletion(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<Result<void, ApiError>> {
  const { error } = await client.rpc("cancel_workspace_deletion", {
    p_workspace_id: ctx.workspaceId,
  })
  return error ? err(refusal(error)) : ok(undefined)
}

/**
 * Every tenant table of the school, as rows the caller may read. Owner only,
 * three a day (audited as `workspace.exported`); refused before any table is
 * read when either check fails.
 */
export async function exportWorkspaceData(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<
  Result<{ table: string; rows: Record<string, unknown>[] }[], ApiError>
> {
  const logged = await client.rpc("log_workspace_export", {
    p_workspace_id: ctx.workspaceId,
  })
  if (logged.error) return err(refusal(logged.error))

  const tables = await client.rpc("workspace_export_tables")
  if (tables.error) return err(UNAVAILABLE)

  const out: { table: string; rows: Record<string, unknown>[] }[] = []
  for (const table of z.array(z.string()).parse(tables.data ?? [])) {
    const { data, error } = await client.rpc("export_workspace_table", {
      p_workspace_id: ctx.workspaceId,
      p_table: table,
    })
    if (error) return err(refusal(error))
    out.push({
      table,
      rows: z.array(z.record(z.string(), z.unknown())).parse(data ?? []),
    })
  }
  return ok(out)
}

const PURGE_CODES = new Set([
  "NOT_DUE",
  "SUSPENDED",
  "FILES_PRESENT",
  "ACTIVE_SUBSCRIPTION",
  "UNPAID_BALANCE",
])

/**
 * The daily purge (service role only — `withServiceRole` in the cron route).
 * Deletes the schools whose grace ended longest ago, one transaction per
 * school, at most PURGE_PER_RUN per run so a run stays inside the route's
 * maxDuration. A refused school (FILES_PRESENT, SUSPENDED…) fails fast and
 * does not count, so stuck schools never starve the rest. Ids only.
 */
export const PURGE_PER_RUN = 5

export async function purgeDueWorkspaces(
  client: AcadigmaSupabaseClient
): Promise<
  Result<{ purged: string[]; failed: { id: string; code: string }[] }, ApiError>
> {
  const { data, error } = await client
    .from("workspaces")
    .select("id")
    .lte("deletion_scheduled_at", new Date().toISOString())
    .order("deletion_scheduled_at", { ascending: true })
    .limit(50)
  if (error) return err(UNAVAILABLE)

  const purged: string[] = []
  const failed: { id: string; code: string }[] = []
  for (const { id } of z
    .array(z.object({ id: z.string() }))
    .parse(data ?? [])) {
    if (purged.length >= PURGE_PER_RUN) break
    const res = await client.rpc("purge_due_workspace", { p_workspace_id: id })
    // Named codes only — a raw Postgres message may carry key values.
    if (res.error)
      failed.push({
        id,
        code: PURGE_CODES.has(res.error.message)
          ? res.error.message
          : "UNKNOWN",
      })
    else purged.push(id)
  }
  return ok({ purged, failed })
}
