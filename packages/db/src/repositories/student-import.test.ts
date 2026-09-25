import { describe, expect, it } from "vitest"

import {
  createImportBatch,
  getImportBatch,
  IMPORT_CHUNK_SIZE,
  listImportExistingStudents,
  runImportBatch,
} from "./student-import"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "owner",
} as unknown as WorkspaceContext
const BATCH = "33333333-3333-4333-8333-333333333333"

type Reply = { data: unknown; error: unknown }

function fakeClient(reply: Reply, rpcReplies: Reply[] = []) {
  const ops: [string, unknown[]][] = []
  const rpcCalls: unknown[] = []
  const chain: unknown = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "then") {
          return (resolve: (r: Reply) => void) => resolve(reply)
        }
        return (...args: unknown[]) => {
          ops.push([prop, args])
          return chain
        }
      },
    }
  )
  const client = {
    from: (table: string) => {
      ops.push(["from", [table]])
      return chain
    },
    async rpc(name: string, args: unknown) {
      rpcCalls.push([name, args])
      return rpcReplies.shift() ?? { data: null, error: null }
    },
  }
  return { client: client as unknown as AcadigmaSupabaseClient, ops, rpcCalls }
}

describe("createImportBatch", () => {
  it("inserts the report under the caller's workspace and user", async () => {
    const { client, ops } = fakeClient({ data: { id: BATCH }, error: null })
    const result = await createImportBatch(client, CTX, {
      filename: "register.xlsx",
      report: { rows: [], ignoredColumns: [] },
      totals: { total: 0, valid: 0, error: 0 },
    })
    expect(result).toEqual({ ok: true, data: { batchId: BATCH } })
    expect(ops[1]).toEqual([
      "insert",
      [
        expect.objectContaining({
          workspace_id: CTX.workspaceId,
          created_by: CTX.userId,
          filename: "register.xlsx",
        }),
      ],
    ])
  })
})

describe("getImportBatch", () => {
  it("filters by workspace and refuses a malformed report", async () => {
    const { client, ops } = fakeClient({
      data: { id: BATCH, report: { rows: "nope" } },
      error: null,
    })
    const result = await getImportBatch(client, CTX, BATCH)
    expect(result.ok).toBe(false)
    expect(ops).toContainEqual(["eq", ["workspace_id", CTX.workspaceId]])
  })

  it("is not_found when RLS hides the row", async () => {
    const { client } = fakeClient({ data: null, error: null })
    const result = await getImportBatch(client, CTX, BATCH)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("runImportBatch", () => {
  it("calls the database chunk by chunk until nothing is left", async () => {
    const { client, rpcCalls } = fakeClient({ data: null, error: null }, [
      { data: { remaining: 150, created_count: 100 }, error: null },
      { data: { remaining: 50, created_count: 200 }, error: null },
      { data: { remaining: 0, created_count: 250 }, error: null },
    ])
    const result = await runImportBatch(client, CTX, BATCH)
    expect(result).toEqual({ ok: true, data: { createdCount: 250 } })
    expect(rpcCalls).toHaveLength(3)
    expect(rpcCalls[0]).toEqual([
      "import_student_batch",
      {
        p_workspace_id: CTX.workspaceId,
        p_batch_id: BATCH,
        p_limit: IMPORT_CHUNK_SIZE,
      },
    ])
  })

  it("maps the database's named errors", async () => {
    for (const [message, code] of [
      ["BATCH_EXPIRED", "conflict"],
      ["FORBIDDEN", "forbidden"],
      ["PLAN_READ_ONLY", "payment_required"],
      ["something else", "dependency_unavailable"],
    ]) {
      const { client } = fakeClient({ data: null, error: null }, [
        { data: null, error: { message } },
      ])
      const result = await runImportBatch(client, CTX, BATCH)
      expect(!result.ok && result.error.code).toBe(code)
    }
  })
})

describe("listImportExistingStudents", () => {
  it("maps the roster keys and asks for the caller's workspace", async () => {
    const { client, rpcCalls } = fakeClient({ data: null, error: null }, [
      {
        data: [
          {
            section_id: "s",
            name: "rahim uddin",
            date_of_birth: "2014-03-09",
            student_code: "STU-2026-00001",
          },
        ],
        error: null,
      },
    ])
    const result = await listImportExistingStudents(client, CTX)
    expect(result).toEqual({
      ok: true,
      data: [
        {
          sectionId: "s",
          name: "rahim uddin",
          dateOfBirth: "2014-03-09",
          studentCode: "STU-2026-00001",
        },
      ],
    })
    expect(rpcCalls[0]).toEqual([
      "student_import_existing",
      { p_workspace_id: CTX.workspaceId },
    ])
  })

  it("fails closed when the database is unreachable", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: null, error: { message: "x" } },
    ])
    expect((await listImportExistingStudents(client, CTX)).ok).toBe(false)
  })
})
