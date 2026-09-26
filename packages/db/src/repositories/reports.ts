/**
 * F-OP-03 Parts 1-2 — `report_runs` read/insert (§3.1, §7 `createReportRun`).
 *
 * `report_run_items` has no repository function here: nothing in this PR
 * writes it (Part 5 bulk rendering does) — see the migration's own comment.
 *
 * Idempotency (§5.8): `computeIdempotencyKey` hashes
 * `workspace | kind | canonical(params) | locale | dataVersion`.
 * `dataVersion` should be `max(updated_at)` over the rows a report reads
 * (spec §11 OQ3) — undefined for the `'sample'` kind, which reads nothing.
 * Until a real kind needs it, this falls back to the 10-minute time bucket
 * OQ3 names as the fallback: identical requests inside the same 10-minute
 * window collapse onto one run; the next window renders fresh.
 */
import { createHash } from "node:crypto"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type ReportKind,
  type ReportLocale,
  type ReportRun,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { Json } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const NOT_FOUND: ApiError = apiError(
  "not_found",
  "This report run does not exist, or you cannot see it."
)

const RUN_COLUMNS =
  "id, workspace_id, kind, params, status, file_id, page_count, item_count, " +
  "locale, requested_by, requested_at, started_at, completed_at, duration_ms, " +
  "error_code, error_detail, expires_at"

/** Stable JSON: object keys sorted, recursively — so field order never changes the hash. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonicalize(v)] as const)
    return Object.fromEntries(entries)
  }
  return value
}

const DATA_VERSION_BUCKET_MS = 10 * 60 * 1000

export function computeIdempotencyKey(
  workspaceId: string,
  kind: ReportKind,
  params: Record<string, unknown>,
  locale: ReportLocale,
  /** Test seam; production always uses the real 10-minute clock bucket. */
  now: number = Date.now()
): string {
  const dataVersion = Math.floor(now / DATA_VERSION_BUCKET_MS).toString()
  const canonical = JSON.stringify(canonicalize(params))
  return createHash("sha256")
    .update(`${workspaceId}|${kind}|${canonical}|${locale}|${dataVersion}`)
    .digest("hex")
}

function toReportRun(row: Record<string, unknown>): ReportRun {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    kind: row.kind as ReportKind,
    params: row.params as Record<string, unknown>,
    status: row.status as ReportRun["status"],
    fileId: (row.file_id as string | null) ?? null,
    pageCount: (row.page_count as number | null) ?? null,
    itemCount: (row.item_count as number | null) ?? null,
    locale: row.locale as ReportLocale,
    requestedBy: row.requested_by as string,
    requestedAt: row.requested_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorDetail: (row.error_detail as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

/**
 * Inserts a new `queued` run, or — if a `queued|rendering|ready` run with the
 * same `(workspace_id, idempotency_key)` already exists — returns that run
 * instead (§5.8, §9 AC19). The unique partial index on the table is what
 * makes the race between two identical concurrent requests safe: only one
 * insert wins, and the loser's `23505` is caught here and turned into a
 * lookup rather than an error the user sees.
 */
export async function createReportRun(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: {
    kind: ReportKind
    params: Record<string, unknown>
    locale: ReportLocale
  }
): Promise<Result<ReportRun, ApiError>> {
  const idempotencyKey = computeIdempotencyKey(
    ctx.workspaceId,
    input.kind,
    input.params,
    input.locale
  )

  const { data, error } = await supabase
    .from("report_runs")
    .insert({
      workspace_id: ctx.workspaceId,
      kind: input.kind,
      params: input.params as Json,
      locale: input.locale,
      requested_by: ctx.userId,
      idempotency_key: idempotencyKey,
    })
    .select(RUN_COLUMNS)
    .single()

  if (!error) return ok(toReportRun(data as unknown as Record<string, unknown>))

  if (error.code === "23505") {
    const existing = await supabase
      .from("report_runs")
      .select(RUN_COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .in("status", ["queued", "rendering", "ready"])
      .maybeSingle()
    if (existing.error) return err(UNAVAILABLE)
    if (!existing.data) return err(UNAVAILABLE) // race: the other run just expired/failed
    return ok(toReportRun(existing.data as unknown as Record<string, unknown>))
  }

  return err(UNAVAILABLE)
}

export async function getReportRun(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  runId: string
): Promise<Result<ReportRun, ApiError>> {
  const { data, error } = await supabase
    .from("report_runs")
    .select(RUN_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", runId)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND) // RLS-invisible and genuinely-missing look the same on purpose
  return ok(toReportRun(data as unknown as Record<string, unknown>))
}

export async function listReportRuns(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  limit = 25
): Promise<Result<ReportRun[], ApiError>> {
  const { data, error } = await supabase
    .from("report_runs")
    .select(RUN_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .order("requested_at", { ascending: false })
    .limit(limit)

  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((row) =>
      toReportRun(row as unknown as Record<string, unknown>)
    )
  )
}

/**
 * Moves a `queued` run through `rendering` to `ready`/`failed` (§4 W1: "the
 * job drainer... plus an immediate in-request kick for single-item runs" —
 * `'sample'` is always a single item, so `createReportRun`'s caller kicks
 * this synchronously rather than waiting on a cron drainer this Part does
 * not build). Runs under `withServiceRole`: nothing in `report_runs`' RLS
 * grants `authenticated` an UPDATE, on purpose (migration comment) — only
 * the pipeline itself may move a run's status.
 *
 * Does not persist the rendered PDF (no `files`/storage row): F-OP-03's own
 * "files/storage" dependency (spec header table) is not built yet, and this
 * PR does not add `storage.objects` RLS policies to invent it — that is
 * cross-cutting infra several features need, not this Part's to build.
 * `GET /api/pdf/[runId]` re-renders the same deterministic bytes on request
 * instead (documented in the PR).
 */
export async function markReportRunRendering(
  supabase: AcadigmaSupabaseClient,
  runId: string
): Promise<Result<void, ApiError>> {
  const { error } = await supabase
    .from("report_runs")
    .update({ status: "rendering", started_at: new Date().toISOString() })
    .eq("id", runId)
  if (error) return err(UNAVAILABLE)
  return ok(undefined)
}

export async function markReportRunReady(
  supabase: AcadigmaSupabaseClient,
  runId: string,
  pageCount: number,
  durationMs: number,
  /** Bulk runs only (F-OP-03 Part 5, D-207) — the number of `report_run_items`
   * rows the run attempted. Single-item kinds never pass this; the column
   * stays null for them, as it already was before this Part. */
  itemCount?: number
): Promise<Result<void, ApiError>> {
  const { error } = await supabase
    .from("report_runs")
    .update({
      status: "ready",
      page_count: pageCount,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      ...(itemCount !== undefined ? { item_count: itemCount } : {}),
    })
    .eq("id", runId)
  if (error) return err(UNAVAILABLE)
  return ok(undefined)
}

export async function markReportRunFailed(
  supabase: AcadigmaSupabaseClient,
  runId: string,
  errorCode: string,
  errorDetail: string
): Promise<Result<void, ApiError>> {
  const { error } = await supabase
    .from("report_runs")
    .update({
      status: "failed",
      error_code: errorCode,
      error_detail: errorDetail,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId)
  if (error) return err(UNAVAILABLE)
  return ok(undefined)
}

export type ReportRunItemInput = {
  subjectId: string
  status: "ready" | "failed"
  pageFrom?: number
  pageTo?: number
  errorDetail?: string
}

/**
 * F-OP-03 Part 5 (D-207) — one row per student a bulk run attempted, written
 * once at the end of the (synchronous, D-205-style) render step under
 * `withServiceRole` — `report_run_items` has no INSERT grant for
 * `authenticated` (300310's migration comment: written by the pipeline
 * only). A per-student failure is recorded here without failing the run
 * (§4 W2): the caller still calls this even when every item failed, so the
 * run's own status/error reflects "nothing rendered", not "items lost".
 */
export async function createReportRunItems(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  runId: string,
  items: readonly ReportRunItemInput[]
): Promise<Result<void, ApiError>> {
  if (items.length === 0) return ok(undefined)
  const { error } = await supabase.from("report_run_items").insert(
    items.map((item) => ({
      workspace_id: ctx.workspaceId,
      report_run_id: runId,
      subject_type: "student",
      subject_id: item.subjectId,
      status: item.status,
      page_from: item.pageFrom ?? null,
      page_to: item.pageTo ?? null,
      error_detail: item.errorDetail ?? null,
    }))
  )
  if (error) return err(UNAVAILABLE)
  return ok(undefined)
}
