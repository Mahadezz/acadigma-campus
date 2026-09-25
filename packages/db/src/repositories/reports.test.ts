import { describe, expect, it } from "vitest"

import {
  computeIdempotencyKey,
  createReportRun,
  getReportRun,
  listReportRuns,
  markReportRunFailed,
  markReportRunReady,
  markReportRunRendering,
} from "./reports"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const NOW = Date.parse("2026-09-25T09:30:00.000Z")

const CTX: WorkspaceContext = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
  role: "teacher",
  workspaceType: "school",
  plan: "starter",
}

const ROW = {
  id: "e0000001-0000-0000-0000-000000000001",
  workspace_id: CTX.workspaceId,
  kind: "sample",
  params: { kind: "sample" },
  status: "queued",
  file_id: null,
  page_count: null,
  item_count: null,
  locale: "bn",
  requested_by: CTX.userId,
  requested_at: "2026-09-25T09:30:00.000Z",
  started_at: null,
  completed_at: null,
  duration_ms: null,
  error_code: null,
  error_detail: null,
  expires_at: "2026-10-25T09:30:00.000Z",
}

type Recorded = { op: string; args: unknown[] }[]

/**
 * A chainable stand-in for the supabase-js builder that records every call
 * (same pattern as `calendar.test.ts`'s `fakeClient`). `then` resolves any
 * chain that is awaited without an explicit terminal call (`update().eq()`).
 */
function fakeClient(result: {
  data: unknown
  error: { code?: string; message: string; details?: string } | null
}): { client: AcadigmaSupabaseClient; calls: Recorded } {
  const calls: Recorded = []
  const builder: Record<string, unknown> = {}
  for (const op of ["select", "eq", "in", "order", "insert", "update"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args })
      return builder
    }
  }
  builder["limit"] = async (...args: unknown[]) => {
    calls.push({ op: "limit", args })
    return result
  }
  builder["single"] = async () => result
  builder["maybeSingle"] = async () => result
  builder["then"] = (resolve: (v: unknown) => unknown) => resolve(result)
  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] })
      return builder
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
  return { client, calls }
}

describe("computeIdempotencyKey", () => {
  it("is stable under key reordering in params (§10)", () => {
    const a = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample", extra: "x" },
      "en",
      NOW
    )
    const b = computeIdempotencyKey(
      "ws-1",
      "sample",
      { extra: "x", kind: "sample" },
      "en",
      NOW
    )
    expect(a).toBe(b)
  })

  it("differs by workspace", () => {
    const a = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    const b = computeIdempotencyKey(
      "ws-2",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    expect(a).not.toBe(b)
  })

  it("differs by locale", () => {
    const a = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    const b = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "bn",
      NOW
    )
    expect(a).not.toBe(b)
  })

  it("differs by params content", () => {
    const a = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    const b = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample", note: "x" },
      "en",
      NOW
    )
    expect(a).not.toBe(b)
  })

  it("differs once the 10-minute data-version bucket rolls over (§11 OQ3 fallback)", () => {
    const a = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    const b = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW + 11 * 60 * 1000
    )
    expect(a).not.toBe(b)
  })

  it("is identical for two requests inside the same 10-minute bucket", () => {
    const a = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    const b = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW + 60 * 1000
    )
    expect(a).toBe(b)
  })

  it("is a 64-character lowercase hex sha256 digest", () => {
    const key = computeIdempotencyKey(
      "ws-1",
      "sample",
      { kind: "sample" },
      "en",
      NOW
    )
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("createReportRun", () => {
  it("inserts a queued run, scoped to the caller's workspace and self as requester", async () => {
    const { client, calls } = fakeClient({ data: ROW, error: null })
    const result = await createReportRun(client, CTX, {
      kind: "sample",
      params: { kind: "sample" },
      locale: "bn",
    })
    expect(result.ok && result.data.id).toBe(ROW.id)
    const insertCall = calls.find((c) => c.op === "insert")
    expect(insertCall?.args[0]).toMatchObject({
      workspace_id: CTX.workspaceId,
      requested_by: CTX.userId,
      kind: "sample",
    })
  })

  it("on a duplicate idempotency key (23505), returns the existing live run instead of erroring", async () => {
    const calls: Recorded = []
    const insertBuilder: Record<string, unknown> = {
      insert: (...args: unknown[]) => {
        calls.push({ op: "insert", args })
        return insertBuilder
      },
      select: (...args: unknown[]) => {
        calls.push({ op: "select", args })
        return insertBuilder
      },
      single: async () => ({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      }),
    }
    const lookupBuilder: Record<string, unknown> = {}
    for (const op of ["select", "eq", "in"]) {
      lookupBuilder[op] = (...args: unknown[]) => {
        calls.push({ op, args })
        return lookupBuilder
      }
    }
    lookupBuilder["maybeSingle"] = async () => ({ data: ROW, error: null })

    let callCount = 0
    const client = {
      from: (table: string) => {
        calls.push({ op: "from", args: [table] })
        callCount += 1
        return callCount === 1 ? insertBuilder : lookupBuilder
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as AcadigmaSupabaseClient

    const result = await createReportRun(client, CTX, {
      kind: "sample",
      params: { kind: "sample" },
      locale: "bn",
    })
    expect(result.ok && result.data.id).toBe(ROW.id)
    const inClause = calls.find((c) => c.op === "in")
    expect(inClause?.args).toEqual(["status", ["queued", "rendering", "ready"]])
  })

  it("maps any other insert error to dependency_unavailable", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "42501", message: "denied" },
    })
    const result = await createReportRun(client, CTX, {
      kind: "sample",
      params: { kind: "sample" },
      locale: "bn",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("getReportRun", () => {
  it("scopes the lookup to workspace_id and id, and maps the row", async () => {
    const { client, calls } = fakeClient({ data: ROW, error: null })
    const result = await getReportRun(client, CTX, ROW.id)
    expect(result.ok && result.data.locale).toBe("bn")
    expect(calls).toContainEqual({
      op: "eq",
      args: ["workspace_id", CTX.workspaceId],
    })
  })

  it("returns not_found when the row is missing or RLS-invisible — same response either way", async () => {
    const { client } = fakeClient({ data: null, error: null })
    const result = await getReportRun(client, CTX, "missing-id")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })
})

describe("listReportRuns", () => {
  it("orders by requested_at desc and maps every row", async () => {
    const { client, calls } = fakeClient({ data: [ROW, ROW], error: null })
    const result = await listReportRuns(client, CTX)
    expect(result.ok && result.data).toHaveLength(2)
    expect(calls).toContainEqual({
      op: "order",
      args: ["requested_at", { ascending: false }],
    })
  })

  it("returns an empty list rather than null when there are no runs", async () => {
    const { client } = fakeClient({ data: null, error: null })
    const result = await listReportRuns(client, CTX)
    expect(result.ok && result.data).toEqual([])
  })
})

describe("markReportRunRendering / markReportRunReady / markReportRunFailed", () => {
  it("markReportRunRendering sets status and started_at", async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    const result = await markReportRunRendering(client, ROW.id)
    expect(result.ok).toBe(true)
    const update = calls.find((c) => c.op === "update")
    expect(update?.args[0]).toMatchObject({ status: "rendering" })
  })

  it("markReportRunReady sets status, page_count and duration_ms", async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    const result = await markReportRunReady(client, ROW.id, 1, 42)
    expect(result.ok).toBe(true)
    const update = calls.find((c) => c.op === "update")
    expect(update?.args[0]).toMatchObject({
      status: "ready",
      page_count: 1,
      duration_ms: 42,
    })
  })

  it("markReportRunFailed sets status, error_code and error_detail", async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    const result = await markReportRunFailed(
      client,
      ROW.id,
      "render_error",
      "boom"
    )
    expect(result.ok).toBe(true)
    const update = calls.find((c) => c.op === "update")
    expect(update?.args[0]).toMatchObject({
      status: "failed",
      error_code: "render_error",
      error_detail: "boom",
    })
  })

  it("maps an update error to dependency_unavailable", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "db down" },
    })
    const result = await markReportRunRendering(client, ROW.id)
    expect(result.ok).toBe(false)
  })
})
