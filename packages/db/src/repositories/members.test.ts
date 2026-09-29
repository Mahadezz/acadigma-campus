import { describe, expect, it } from "vitest"

import {
  approveMember,
  listMembers,
  MEMBER_PAGE_SIZE,
  rejectMember,
} from "./members"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "admin",
} as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown }

/** `rpc` answers `rpcReply`; each `from(...)` chain answers the next of `fromReplies`. */
function fakeClient(rpcReply: Reply, fromReplies: Reply[] = []) {
  const rpcCalls: [string, unknown][] = []
  const chainCalls: [string, unknown[]][] = []
  const client = {
    from() {
      const reply = fromReplies.shift() ?? { data: null, error: null }
      const chain: unknown = new Proxy(
        {},
        {
          get(_, prop: string) {
            if (prop === "then")
              return (resolve: (r: Reply) => void) => resolve(reply)
            if (prop === "maybeSingle") return async () => reply
            return (...args: unknown[]) => {
              chainCalls.push([prop, args])
              return chain
            }
          },
        }
      )
      return chain
    },
    async rpc(name: string, args: unknown) {
      rpcCalls.push([name, args])
      return rpcReply
    },
  }
  return {
    client: client as unknown as AcadigmaSupabaseClient,
    rpcCalls,
    chainCalls,
  }
}

function row(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    user_id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    full_name: `Member ${i}`,
    email: `m${i}@test.local`,
    avatar_url: null,
    role: "teacher",
    status: "pending",
    label_id: null,
    department: null,
    via_invitation: false,
    created_at: "2026-09-29T00:00:00Z",
    joined_at: null,
    removed_at: null,
  }
}

describe("listMembers (D-110)", () => {
  it("asks for one row more than a page, scoped to the context's workspace", async () => {
    const { client, rpcCalls } = fakeClient({ data: [row(1)], error: null })
    const r = await listMembers(CTX, client, { status: "pending", q: "ra" })
    expect(rpcCalls[0]).toEqual([
      "list_workspace_members",
      {
        p_workspace_id: CTX.workspaceId,
        p_status: "pending",
        p_q: "ra",
        p_after: undefined,
        p_limit: MEMBER_PAGE_SIZE + 1,
      },
    ])
    expect(r.ok && r.data).toEqual({
      items: [
        {
          id: row(1).id,
          userId: row(1).user_id,
          fullName: "Member 1",
          email: "m1@test.local",
          role: "teacher",
          status: "pending",
          department: null,
          viaInvitation: false,
          requestedAt: "2026-09-29T00:00:00Z",
          joinedAt: null,
          removedAt: null,
        },
      ],
      nextCursor: null,
    })
  })

  it("an empty search is no search", async () => {
    const { client, rpcCalls } = fakeClient({ data: [], error: null })
    await listMembers(CTX, client, { status: "active", q: "" })
    expect((rpcCalls[0]?.[1] as { p_q: unknown }).p_q).toBeUndefined()
  })

  it("a full page plus one gives the last shown row as the cursor", async () => {
    const rows = Array.from({ length: MEMBER_PAGE_SIZE + 1 }, (_, i) => row(i))
    const { client } = fakeClient({ data: rows, error: null })
    const r = await listMembers(CTX, client, { status: "active" })
    expect(r.ok && r.data.items).toHaveLength(MEMBER_PAGE_SIZE)
    expect(r.ok && r.data.nextCursor).toBe(row(MEMBER_PAGE_SIZE - 1).id)
  })

  it.each([
    ["FORBIDDEN", "forbidden"],
    ["CURSOR_INVALID", "not_found"],
    ["boom", "dependency_unavailable"],
  ])("maps %s to %s", async (message, code) => {
    const { client } = fakeClient({ data: null, error: { message } })
    const r = await listMembers(CTX, client, { status: "active" })
    expect(!r.ok && r.error.code).toBe(code)
  })

  it("a malformed row is unavailable, never passed through", async () => {
    const { client } = fakeClient({
      data: [{ ...row(1), role: "superadmin" }],
      error: null,
    })
    const r = await listMembers(CTX, client, { status: "active" })
    expect(!r.ok && r.error.code).toBe("dependency_unavailable")
  })
})

describe("approveMember / rejectMember (D-110)", () => {
  const ID = row(1).id

  it("updates only a pending, non-parent row of the context's workspace", async () => {
    const { client, chainCalls } = fakeClient({ data: null, error: null }, [
      { data: [{ id: ID, status: "active" }], error: null },
    ])
    const r = await approveMember(CTX, client, ID)
    expect(r).toEqual({ ok: true, data: { id: ID, status: "active" } })
    expect(chainCalls).toEqual(
      expect.arrayContaining([
        ["update", [{ status: "active" }]],
        ["eq", ["workspace_id", CTX.workspaceId]],
        ["eq", ["id", ID]],
        ["eq", ["status", "pending"]],
        ["neq", ["role", "parent"]],
      ])
    )
  })

  it("rejecting sets removed", async () => {
    const { client, chainCalls } = fakeClient({ data: null, error: null }, [
      { data: [{ id: ID, status: "removed" }], error: null },
    ])
    const r = await rejectMember(CTX, client, ID)
    expect(r.ok && r.data.status).toBe("removed")
    expect(chainCalls[0]).toEqual(["update", [{ status: "removed" }]])
  })

  it("a double tap (already active) is success", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: [], error: null },
      { data: { id: ID, status: "active" }, error: null },
    ])
    expect(await approveMember(CTX, client, ID)).toEqual({
      ok: true,
      data: { id: ID, status: "active" },
    })
  })

  it("a decided request is NOT_PENDING", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: [], error: null },
      { data: { id: ID, status: "removed" }, error: null },
    ])
    const r = await approveMember(CTX, client, ID)
    expect(!r.ok && r.error).toMatchObject({
      code: "conflict",
      fieldErrors: { _root: ["NOT_PENDING"] },
    })
  })

  it("an invisible row is not_found", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: [], error: null },
      { data: null, error: null },
    ])
    const r = await rejectMember(CTX, client, ID)
    expect(!r.ok && r.error.code).toBe("not_found")
  })

  it.each([
    ["42501", "forbidden"],
    ["08006", "dependency_unavailable"],
  ])("a database error %s is %s", async (code, expected) => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: null, error: { code, message: "x" } },
    ])
    const r = await approveMember(CTX, client, ID)
    expect(!r.ok && r.error.code).toBe(expected)
  })

  it("a failed re-read is unavailable", async () => {
    const { client } = fakeClient({ data: null, error: null }, [
      { data: [], error: null },
      { data: null, error: { message: "x" } },
    ])
    const r = await approveMember(CTX, client, ID)
    expect(!r.ok && r.error.code).toBe("dependency_unavailable")
  })
})
