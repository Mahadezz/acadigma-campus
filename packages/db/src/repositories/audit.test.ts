import { describe, expect, it } from "vitest"

import {
  getAuditEvent,
  getRecordHistory,
  listAuditEvents,
  listCorrelatedEvents,
} from "./audit"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111"
const ACTOR_ID = "aaaaaaaa-0000-0000-0000-000000000001"
const SUBJECT_ID = "aaaaaaaa-0000-0000-0000-000000000002"

const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: ACTOR_ID,
  role: "owner",
  plan: "pro",
  workspaceType: "school",
}

const EVENT_ROW = {
  id: 42,
  workspace_id: WORKSPACE_ID,
  actor_id: ACTOR_ID,
  actor_kind: "user",
  action: "member.role_changed",
  table_name: "public.workspace_members",
  row_id: "cccccccc-0000-0000-0000-000000000001",
  subject_user_id: SUBJECT_ID,
  before: { role: "teacher" },
  after: { role: "admin" },
  changed_fields: ["role"],
  correlation_id: "dddddddd-0000-0000-0000-000000000001",
  request_ip_hash: null,
  user_agent_family: null,
  severity: "critical",
  created_at: "2026-09-17T10:00:00Z",
}

/**
 * A chainable stand-in for a supabase-js PostgrestFilterBuilder, extended from
 * `packages/db/src/repositories/plans.test.ts`'s fake with the filter methods this
 * repository actually calls: `or`, `like`, `ilike`, `gte`, `lte`, `lt`, `in`,
 * `order`, `limit`.
 */
function queryResult(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    like: () => builder,
    ilike: () => builder,
    gte: () => builder,
    lte: () => builder,
    lt: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (value: unknown) => void,
      reject: (reason: unknown) => void
    ) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

function fakeClient(byTable: Record<string, ReturnType<typeof queryResult>>) {
  return {
    from: (table: string) =>
      byTable[table] ?? queryResult({ data: [], error: null }),
  } as unknown as AcadigmaSupabaseClient
}

const PROFILE_ROWS = [
  { id: ACTOR_ID, full_name: "Nusrat Jahan" },
  { id: SUBJECT_ID, full_name: "Rahim Uddin" },
]

describe("listAuditEvents", () => {
  it("maps rows and resolves actor/subject display names", async () => {
    const client = fakeClient({
      audit_events_view: queryResult({ data: [EVENT_ROW], error: null }),
      profiles: queryResult({ data: PROFILE_ROWS, error: null }),
    })

    const result = await listAuditEvents(CTX, client, { limit: 25 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(1)
    expect(result.data.items[0]).toMatchObject({
      id: "42",
      action: "member.role_changed",
      severity: "critical",
      actorName: "Nusrat Jahan",
      subjectName: "Rahim Uddin",
      changedFields: ["role"],
    })
    expect(result.data.nextCursor).toBeNull()
  })

  it("computes nextCursor when more rows than the page limit come back", async () => {
    const rows = [
      { ...EVENT_ROW, id: 3 },
      { ...EVENT_ROW, id: 2 },
      { ...EVENT_ROW, id: 1 },
    ]
    const client = fakeClient({
      audit_events_view: queryResult({ data: rows, error: null }),
      profiles: queryResult({ data: [], error: null }),
    })

    const result = await listAuditEvents(CTX, client, { limit: 2 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items.map((e) => e.id)).toEqual(["3", "2"])
    expect(result.data.nextCursor).toBe("2")
  })

  it("resolves a missing/anonymised actor to 'Deleted user' rather than blank", async () => {
    const client = fakeClient({
      audit_events_view: queryResult({ data: [EVENT_ROW], error: null }),
      profiles: queryResult({ data: [], error: null }), // neither profile found
    })

    const result = await listAuditEvents(CTX, client, { limit: 25 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]?.actorName).toBe("Deleted user")
    expect(result.data.items[0]?.subjectName).toBe("Deleted user")
  })

  it("never queries profiles when no rows have an actor or subject", async () => {
    let profilesQueried = false
    const client = {
      from: (table: string) => {
        if (table === "profiles") {
          profilesQueried = true
          return queryResult({ data: [], error: null })
        }
        return queryResult({
          data: [{ ...EVENT_ROW, actor_id: null, subject_user_id: null }],
          error: null,
        })
      },
    } as unknown as AcadigmaSupabaseClient

    const result = await listAuditEvents(CTX, client, { limit: 25 })
    expect(result.ok).toBe(true)
    expect(profilesQueried).toBe(false)
  })

  it("reports a query error as dependency_unavailable", async () => {
    const client = fakeClient({
      audit_events_view: queryResult({
        data: null,
        error: { message: "connection reset" },
      }),
    })
    const result = await listAuditEvents(CTX, client, { limit: 25 })
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("getAuditEvent", () => {
  it("returns the single event with names resolved", async () => {
    const client = fakeClient({
      audit_events_view: queryResult({ data: EVENT_ROW, error: null }),
      profiles: queryResult({ data: PROFILE_ROWS, error: null }),
    })
    const result = await getAuditEvent(CTX, client, { id: "42" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.actorName).toBe("Nusrat Jahan")
  })

  it("is not_found when the row does not exist or is not visible", async () => {
    const client = fakeClient({
      audit_events_view: queryResult({ data: null, error: null }),
    })
    const result = await getAuditEvent(CTX, client, { id: "999" })
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("listCorrelatedEvents", () => {
  it("returns every row sharing a correlation id in chronological order", async () => {
    const rows = [
      { ...EVENT_ROW, id: 1, action: "workspaces.insert" },
      { ...EVENT_ROW, id: 2, action: "workspace_members.insert" },
    ]
    const client = fakeClient({
      audit_events_view: queryResult({ data: rows, error: null }),
      profiles: queryResult({ data: [], error: null }),
    })
    const result = await listCorrelatedEvents(CTX, client, {
      correlationId: "dddddddd-0000-0000-0000-000000000001",
      limit: 200,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((e) => e.id)).toEqual(["1", "2"])
  })
})

describe("getRecordHistory", () => {
  it("scopes to one table + row within the workspace", async () => {
    const client = fakeClient({
      audit_events_view: queryResult({ data: [EVENT_ROW], error: null }),
      profiles: queryResult({ data: [], error: null }),
    })
    const result = await getRecordHistory(CTX, client, {
      tableName: "public.workspace_members",
      rowId: "cccccccc-0000-0000-0000-000000000001",
      limit: 25,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(1)
  })
})
