import { describe, expect, it } from "vitest"

import { createHoliday, deleteHoliday, listHolidays } from "./calendar"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX: WorkspaceContext = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
  role: "admin",
  workspaceType: "school",
  plan: "pro",
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Eid-ul-Fitr",
  name_bn: "ঈদুল ফিতর",
  kind: "religious",
  source: "manual",
  starts_on: "2026-03-20",
  ends_on: "2026-03-22",
  note: null,
}

type Recorded = { op: string; args: unknown[] }[]

/** A chainable stand-in for the supabase-js builder that records every call. */
function fakeClient(result: {
  data: unknown
  error: { code?: string; message: string } | null
}): { client: AcadigmaSupabaseClient; calls: Recorded } {
  const calls: Recorded = []
  const builder: Record<string, unknown> = {}
  for (const op of ["select", "eq", "gte", "order", "insert", "delete"]) {
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
  // `delete().eq().eq().select()` resolves at the end of the chain.
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

describe("listHolidays", () => {
  it("scopes to the workspace, filters from a date and maps rows", async () => {
    const { client, calls } = fakeClient({ data: [ROW], error: null })
    const result = await listHolidays(CTX, client, "2026-01-01")
    expect(result.ok && result.data[0]).toEqual({
      id: ROW.id,
      name: "Eid-ul-Fitr",
      nameBn: "ঈদুল ফিতর",
      kind: "religious",
      source: "manual",
      startsOn: "2026-03-20",
      endsOn: "2026-03-22",
      note: null,
    })
    expect(calls).toContainEqual({
      op: "eq",
      args: ["workspace_id", CTX.workspaceId],
    })
    expect(calls).toContainEqual({ op: "gte", args: ["ends_on", "2026-01-01"] })
  })

  it("returns dependency_unavailable on a query error", async () => {
    const { client } = fakeClient({ data: null, error: { message: "down" } })
    const result = await listHolidays(CTX, client, "2026-01-01")
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("createHoliday", () => {
  const input = {
    name: "Eid-ul-Fitr",
    kind: "religious" as const,
    startsOn: "2026-03-20",
    endsOn: "2026-03-22",
  }

  it("inserts into the caller's workspace as a manual holiday", async () => {
    const { client, calls } = fakeClient({ data: ROW, error: null })
    const result = await createHoliday(CTX, client, input)
    expect(result.ok).toBe(true)
    const insert = calls.find((c) => c.op === "insert")
    expect(insert?.args[0]).toMatchObject({
      workspace_id: CTX.workspaceId,
      source: "manual",
      name_bn: null,
      note: null,
    })
  })

  it("maps an RLS refusal to forbidden", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "42501", message: "rls" },
    })
    const result = await createHoliday(CTX, client, input)
    expect(!result.ok && result.error.code).toBe("forbidden")
  })
})

describe("deleteHoliday", () => {
  it("deletes within the workspace", async () => {
    const { client, calls } = fakeClient({
      data: [{ id: ROW.id }],
      error: null,
    })
    const result = await deleteHoliday(CTX, client, ROW.id)
    expect(result.ok).toBe(true)
    expect(calls).toContainEqual({ op: "eq", args: ["id", ROW.id] })
    expect(calls).toContainEqual({
      op: "eq",
      args: ["workspace_id", CTX.workspaceId],
    })
  })

  it("returns not_found when nothing was deleted (another school's id, or gone)", async () => {
    const { client } = fakeClient({ data: [], error: null })
    const result = await deleteHoliday(CTX, client, ROW.id)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})
