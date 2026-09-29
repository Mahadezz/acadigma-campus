import { describe, expect, it } from "vitest"

import {
  getMemberDetail,
  getWorkspaceName,
  leaveWorkspace,
  listOwnershipCandidates,
  removeMember,
  transferOwnership,
} from "./members"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/** F-ID-03 Part 7 (D-112): error mapping and pre-checks, against a fake client. */

const ME = "22222222-2222-4222-8222-222222222222"
const MEMBER = "33333333-3333-4333-8333-333333333333"
const ctxAs = (role: string) =>
  ({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    userId: ME,
    role,
  }) as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown }

/** `rpc` answers `rpcReply`; each `from(...)` chain answers the next of `fromReplies`. */
function fakeClient(fromReplies: Reply[], rpcReply?: Reply) {
  const calls: [string, unknown[]][] = []
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
              calls.push([prop, args])
              return chain
            }
          },
        }
      )
      return chain
    },
    async rpc(name: string, args: unknown) {
      calls.push([name, [args]])
      return rpcReply ?? { data: null, error: null }
    },
  }
  return { client: client as unknown as AcadigmaSupabaseClient, calls }
}

const target = (over: Record<string, unknown> = {}) => ({
  data: {
    id: MEMBER,
    user_id: "x",
    role: "teacher",
    status: "active",
    ...over,
  },
  error: null,
})
const marker = (r: { ok: boolean; error?: { fieldErrors?: unknown } }) =>
  !r.ok && (r.error?.fieldErrors as { _root?: string[] } | undefined)?._root

describe("removeMember", () => {
  it("removes an active member", async () => {
    const { client } = fakeClient([
      target(),
      { data: [{ id: MEMBER }], error: null },
    ])
    expect(await removeMember(ctxAs("admin"), client, MEMBER)).toEqual({
      ok: true,
      data: { id: MEMBER, status: "removed" },
    })
  })

  it("names self, an admin touching an owner, and the last owner", async () => {
    let f = fakeClient([target({ user_id: ME })])
    expect(
      marker(await removeMember(ctxAs("owner"), f.client, MEMBER))
    ).toEqual(["SELF_EDIT_FORBIDDEN"])
    f = fakeClient([target({ role: "owner" })])
    expect(
      marker(await removeMember(ctxAs("admin"), f.client, MEMBER))
    ).toEqual(["FORBIDDEN_OWNER_TARGET"])
    f = fakeClient([
      target({ role: "owner" }),
      { data: null, error: { code: "23514" } },
    ])
    expect(
      marker(await removeMember(ctxAs("owner"), f.client, MEMBER))
    ).toEqual(["LAST_OWNER_BLOCKED"])
  })

  it("treats an already-removed member as success and a waiting one as not found", async () => {
    let f = fakeClient([target({ status: "removed" })])
    expect((await removeMember(ctxAs("admin"), f.client, MEMBER)).ok).toBe(true)
    f = fakeClient([target({ status: "pending" })])
    const r = await removeMember(ctxAs("admin"), f.client, MEMBER)
    expect(!r.ok && r.error.code).toBe("not_found")
    f = fakeClient([{ data: null, error: null }])
    const gone = await removeMember(ctxAs("admin"), f.client, MEMBER)
    expect(!gone.ok && gone.error.code).toBe("not_found")
  })

  it("maps a refused update to forbidden and a failed read to unavailable", async () => {
    let f = fakeClient([target(), { data: null, error: { code: "42501" } }])
    let r = await removeMember(ctxAs("admin"), f.client, MEMBER)
    expect(!r.ok && r.error.code).toBe("forbidden")
    f = fakeClient([{ data: null, error: { code: "XX000" } }])
    r = await removeMember(ctxAs("admin"), f.client, MEMBER)
    expect(!r.ok && r.error.code).toBe("dependency_unavailable")
  })
})

describe("leaveWorkspace", () => {
  it("updates only the caller's own active row", async () => {
    const { client, calls } = fakeClient([
      { data: [{ id: MEMBER }], error: null },
    ])
    expect(await leaveWorkspace(ctxAs("teacher"), client)).toEqual({
      ok: true,
      data: { workspaceId: "11111111-1111-4111-8111-111111111111" },
    })
    expect(calls).toContainEqual(["update", [{ status: "removed" }]])
    expect(calls).toContainEqual(["eq", ["user_id", ME]])
    expect(calls).toContainEqual(["eq", ["status", "active"]])
  })

  it("names the sole owner and maps other failures", async () => {
    let f = fakeClient([{ data: null, error: { code: "23514" } }])
    expect(marker(await leaveWorkspace(ctxAs("owner"), f.client))).toEqual([
      "LAST_OWNER_BLOCKED",
    ])
    f = fakeClient([{ data: null, error: { code: "42501" } }])
    let r = await leaveWorkspace(ctxAs("parent"), f.client)
    expect(!r.ok && r.error.code).toBe("forbidden")
    f = fakeClient([{ data: [], error: null }])
    r = await leaveWorkspace(ctxAs("teacher"), f.client)
    expect(!r.ok && r.error.code).toBe("not_found")
  })
})

describe("listOwnershipCandidates", () => {
  it("returns active admins and teachers other than me, by name", async () => {
    const { client, calls } = fakeClient([
      {
        data: [
          { id: "b", role: "teacher", profiles: { full_name: " Zara " } },
          { id: "a", role: "admin", profiles: { full_name: "Anik" } },
          { id: "c", role: "teacher", profiles: null },
        ],
        error: null,
      },
    ])
    const r = await listOwnershipCandidates(ctxAs("owner"), client)
    expect(r.ok && r.data.map((c) => c.fullName)).toEqual(["—", "Anik", "Zara"])
    expect(calls).toContainEqual(["in", ["role", ["admin", "teacher"]]])
    expect(calls).toContainEqual(["neq", ["user_id", ME]])
  })

  it("fails closed on an unexpected shape", async () => {
    const { client } = fakeClient([
      { data: [{ id: "x", role: "owner", profiles: null }], error: null },
    ])
    const r = await listOwnershipCandidates(ctxAs("owner"), client)
    expect(!r.ok && r.error.code).toBe("dependency_unavailable")
  })
})

describe("transferOwnership", () => {
  it("calls the one-transaction RPC", async () => {
    const { client, calls } = fakeClient([])
    const r = await transferOwnership(ctxAs("owner"), client, {
      memberId: MEMBER,
      keepOwner: true,
    })
    expect(r).toEqual({ ok: true, data: { id: MEMBER } })
    expect(calls).toContainEqual([
      "transfer_ownership",
      [
        {
          p_workspace_id: "11111111-1111-4111-8111-111111111111",
          p_member_id: MEMBER,
          p_keep_owner: true,
        },
      ],
    ])
  })

  it("maps TARGET_NOT_ELIGIBLE and FORBIDDEN", async () => {
    let f = fakeClient([], { data: null, error: { code: "P0002" } })
    expect(
      marker(
        await transferOwnership(ctxAs("owner"), f.client, {
          memberId: MEMBER,
          keepOwner: false,
        })
      )
    ).toEqual(["TARGET_NOT_ELIGIBLE"])
    f = fakeClient([], { data: null, error: { code: "42501" } })
    const r = await transferOwnership(ctxAs("owner"), f.client, {
      memberId: MEMBER,
      keepOwner: false,
    })
    expect(!r.ok && r.error.code).toBe("forbidden")
  })
})

describe("getWorkspaceName / getMemberDetail.isSelf", () => {
  it("reads the school name", async () => {
    const { client } = fakeClient([
      { data: { name: "Green Valley" }, error: null },
    ])
    expect(await getWorkspaceName(ctxAs("owner"), client)).toEqual({
      ok: true,
      data: "Green Valley",
    })
  })

  it("flags the caller's own row", async () => {
    const { client } = fakeClient([
      {
        data: {
          id: MEMBER,
          user_id: ME,
          role: "admin",
          status: "active",
          employee_code: null,
          department: null,
          phone: null,
          label_id: null,
          custom_labels: null,
        },
        error: null,
      },
    ])
    const r = await getMemberDetail(ctxAs("admin"), client, MEMBER)
    expect(r.ok && r.data.isSelf).toBe(true)
  })
})
