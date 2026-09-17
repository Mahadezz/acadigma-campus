import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type AuditEventDto,
  type AuditEventPage,
  type CorrelationInput,
  type GetAuditEventInput,
  type ListAuditEventsInput,
  type RecordHistoryInput,
  type Result,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * Reads over `public.audit_events_view` (F-ID-09 Parts 1-3) — never the base
 * `audit_events` table, which still carries the deprecated raw `ip`/`user_agent`
 * columns the view omits (migration §10). RLS on the underlying table is still
 * what decides row visibility (the view is `security_invoker`); the explicit
 * `.eq`/`.or` scoping here is defence in depth, the same pattern
 * `packages/db/src/repositories/plans.ts` documents.
 *
 * `ctx` is always the FIRST argument (HANDBOOK §8) even though a couple of these
 * reads do not strictly need it beyond the workspace scope filter — a reader with
 * no `WorkspaceContext` at all is a sign the caller has not resolved one, which is
 * exactly the mistake ARCHITECTURE §3 rule 2 exists to prevent.
 */

const VIEW = "audit_events_view"

const DEPENDENCY_UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the audit trail."
)

const rawRowSchema = z.record(z.string(), z.unknown())

/** Rows the owner viewer may see: their own workspace, or an account-level event
 * about them. RLS narrows this further (subject-of-event, platform); this filter
 * only needs to not be MORE permissive than RLS, never to duplicate it exactly. */
function scopeToWorkspace<T extends { or: (filter: string) => T }>(
  query: T,
  workspaceId: string
): T {
  return query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
}

function mapEventRow(
  row: unknown
): Omit<AuditEventDto, "actorName" | "subjectName"> {
  const r = rawRowSchema.parse(row)
  return {
    id: String(r["id"]),
    workspaceId: (r["workspace_id"] as string | null) ?? null,
    actorId: (r["actor_id"] as string | null) ?? null,
    actorKind: r["actor_kind"] as AuditEventDto["actorKind"],
    action: r["action"] as string,
    tableName: (r["table_name"] as string | null) ?? null,
    rowId: (r["row_id"] as string | null) ?? null,
    subjectUserId: (r["subject_user_id"] as string | null) ?? null,
    before: (r["before"] as Record<string, unknown> | null) ?? null,
    after: (r["after"] as Record<string, unknown> | null) ?? null,
    changedFields: (r["changed_fields"] as string[] | null) ?? null,
    correlationId: (r["correlation_id"] as string | null) ?? null,
    requestIpHash: (r["request_ip_hash"] as string | null) ?? null,
    userAgentFamily: (r["user_agent_family"] as string | null) ?? null,
    severity: r["severity"] as AuditEventDto["severity"],
    createdAt: r["created_at"] as string,
  }
}

/**
 * Resolves actor_id / subject_user_id to display names in ONE extra query
 * (`.in()`), never one query per row. A person present in `profiles` but with no
 * readable name (an anonymised, purged account — F-ID-01 §4.9) resolves to
 * "Deleted user" rather than an empty string, so the viewer never renders a blank
 * where an accountability question was asked.
 */
async function attachDisplayNames(
  client: AcadigmaSupabaseClient,
  events: readonly Omit<AuditEventDto, "actorName" | "subjectName">[]
): Promise<AuditEventDto[]> {
  const ids = new Set<string>()
  for (const event of events) {
    if (event.actorId) ids.add(event.actorId)
    if (event.subjectUserId) ids.add(event.subjectUserId)
  }

  const names = new Map<string, string>()
  if (ids.size > 0) {
    const { data } = await client
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(ids))
    for (const row of rawRowSchema.array().parse(data ?? [])) {
      const id = row["id"] as string
      const fullName = (row["full_name"] as string | null)?.trim()
      names.set(id, fullName && fullName.length > 0 ? fullName : "Deleted user")
    }
  }

  const nameFor = (id: string | null): string | null => {
    if (!id) return null
    return names.get(id) ?? "Deleted user"
  }

  return events.map((event) => ({
    ...event,
    actorName: nameFor(event.actorId),
    subjectName: nameFor(event.subjectUserId),
  }))
}

/** Splits a `limit + 1`-row fetch into `(page, nextCursor)` keyset-pagination style. */
function paginate<T extends { id: string }>(
  rows: readonly T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: [...rows], nextCursor: null }
  const items = rows.slice(0, limit)
  return { items, nextCursor: items[items.length - 1]?.id ?? null }
}

// ---------------------------------------------------------------------------
// listAuditEvents — the owner viewer's list (F-ID-09 §4.1, §4.2)
// ---------------------------------------------------------------------------
export async function listAuditEvents(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: ListAuditEventsInput
): Promise<Result<AuditEventPage, ApiError>> {
  let query = client.from(VIEW).select("*")
  query = scopeToWorkspace(query, ctx.workspaceId)

  if (input.actorId) query = query.eq("actor_id", input.actorId)
  if (input.subjectUserId)
    query = query.eq("subject_user_id", input.subjectUserId)
  if (input.tableName) query = query.eq("table_name", input.tableName)
  if (input.rowId) query = query.eq("row_id", input.rowId)
  if (input.severity) query = query.eq("severity", input.severity)
  // Category is the action's domain prefix (member.*, workspace.*, …) —
  // audit_events_view has no `domain` column of its own (that lives on
  // audit_action_catalog), so this matches the same rows a join would.
  if (input.category) query = query.like("action", `${input.category}.%`)
  if (input.from) query = query.gte("created_at", input.from)
  if (input.to) query = query.lte("created_at", input.to)
  // Documented Part 1-3 scope cut: full-text search over the rendered sentence
  // needs a stored, indexed sentence column (Part 4/export territory). For now
  // free text matches the raw action string only.
  if (input.q) query = query.ilike("action", `%${input.q}%`)
  if (input.cursor) query = query.lt("id", input.cursor)

  const { data, error } = await query
    .order("id", { ascending: false })
    .limit(input.limit + 1)

  if (error) return err(DEPENDENCY_UNAVAILABLE)

  const rows = rawRowSchema
    .array()
    .parse(data ?? [])
    .map(mapEventRow)
  const { items, nextCursor } = paginate(rows, input.limit)
  const withNames = await attachDisplayNames(client, items)

  return ok({ items: withNames, nextCursor })
}

// ---------------------------------------------------------------------------
// getAuditEvent — the detail sheet (F-ID-09 §4.3)
// ---------------------------------------------------------------------------
export async function getAuditEvent(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: GetAuditEventInput
): Promise<Result<AuditEventDto, ApiError>> {
  let query = client.from(VIEW).select("*").eq("id", input.id)
  query = scopeToWorkspace(query, ctx.workspaceId)

  const { data, error } = await query.maybeSingle()
  if (error) return err(DEPENDENCY_UNAVAILABLE)
  if (!data) {
    return err(apiError("not_found", "This audit event could not be found."))
  }

  const [withNames] = await attachDisplayNames(client, [mapEventRow(data)])
  if (!withNames)
    return err(apiError("internal", "Failed to resolve the event."))
  return ok(withNames)
}

// ---------------------------------------------------------------------------
// listCorrelatedEvents — "Show everything from this action" (F-ID-09 §4.3)
// ---------------------------------------------------------------------------
export async function listCorrelatedEvents(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: CorrelationInput
): Promise<Result<AuditEventDto[], ApiError>> {
  let query = client
    .from(VIEW)
    .select("*")
    .eq("correlation_id", input.correlationId)
  query = scopeToWorkspace(query, ctx.workspaceId)

  const { data, error } = await query
    // Chronological — "creating a school produced eight rows... listed in order"
    // (acceptance criterion 4), not the list view's reverse-chronological order.
    .order("id", { ascending: true })
    .limit(input.limit)

  if (error) return err(DEPENDENCY_UNAVAILABLE)

  const rows = rawRowSchema
    .array()
    .parse(data ?? [])
    .map(mapEventRow)
  return ok(await attachDisplayNames(client, rows))
}

// ---------------------------------------------------------------------------
// getRecordHistory — the per-record "History" sheet (F-ID-09 §4.4)
// ---------------------------------------------------------------------------
export async function getRecordHistory(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: RecordHistoryInput
): Promise<Result<AuditEventPage, ApiError>> {
  let query = client
    .from(VIEW)
    .select("*")
    .eq("table_name", input.tableName)
    .eq("row_id", input.rowId)
    .eq("workspace_id", ctx.workspaceId)

  if (input.cursor) query = query.lt("id", input.cursor)

  const { data, error } = await query
    .order("id", { ascending: false })
    .limit(input.limit + 1)

  if (error) return err(DEPENDENCY_UNAVAILABLE)

  const rows = rawRowSchema
    .array()
    .parse(data ?? [])
    .map(mapEventRow)
  const { items, nextCursor } = paginate(rows, input.limit)
  const withNames = await attachDisplayNames(client, items)

  return ok({ items: withNames, nextCursor })
}
