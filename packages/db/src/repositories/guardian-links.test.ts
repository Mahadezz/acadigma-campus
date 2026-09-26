import { describe, expect, it } from "vitest"

import {
  acceptGuardianInvitation,
  inviteGuardian,
  listFamilyChildren,
  previewGuardianInvitation,
  revokeGuardianLink,
} from "./guardian-links"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "owner",
} as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown }

function fakeClient(
  rpcReply: Reply,
  fromReply: Reply = { data: [], error: null }
) {
  const calls: [string, unknown][] = []
  const chain: unknown = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "then")
          return (resolve: (r: Reply) => void) => resolve(fromReply)
        return () => chain
      },
    }
  )
  const client = {
    from: () => chain,
    async rpc(name: string, args: unknown) {
      calls.push([name, args])
      return rpcReply
    },
  }
  return { client: client as unknown as AcadigmaSupabaseClient, calls }
}

describe("guardian links (D-108)", () => {
  it("invites with the context's workspace and returns the token once", async () => {
    const { client, calls } = fakeClient({
      data: { invitation_id: "i", token: "abc", expires_at: "2026-10-26" },
      error: null,
    })
    const r = await inviteGuardian(CTX, client, "g1")
    expect(r).toEqual({
      ok: true,
      data: { token: "abc", expiresAt: "2026-10-26" },
    })
    expect(calls[0]).toEqual([
      "invite_guardian",
      { p_workspace_id: CTX.workspaceId, p_guardian_id: "g1" },
    ])
  })

  it.each([
    ["GUARDIAN_ALREADY_LINKED", "conflict"],
    ["RATE_LIMITED", "rate_limited"],
    ["FORBIDDEN", "forbidden"],
    ["PLAN_READ_ONLY", "forbidden"],
    ["something else", "dependency_unavailable"],
  ])("maps %s to %s", async (message, code) => {
    const { client } = fakeClient({ data: null, error: { message } })
    const r = await inviteGuardian(CTX, client, "g1")
    expect(!r.ok && r.error.code).toBe(code)
  })

  it("maps accept errors and returns the school on success", async () => {
    const expired = await acceptGuardianInvitation(
      fakeClient({ data: null, error: { message: "INVITATION_EXPIRED" } })
        .client,
      "t"
    )
    expect(!expired.ok && expired.error.message).toMatch(/expired/)
    const conflict = await acceptGuardianInvitation(
      fakeClient({ data: null, error: { message: "MEMBERSHIP_CONFLICT" } })
        .client,
      "t"
    )
    expect(!conflict.ok && conflict.error.code).toBe("conflict")
    const done = await acceptGuardianInvitation(
      fakeClient({ data: { workspace_id: "w", student_id: "s" }, error: null })
        .client,
      "t"
    )
    expect(done).toEqual({ ok: true, data: { workspaceId: "w" } })
  })

  it("parses both preview shapes", async () => {
    const pending = await previewGuardianInvitation(
      fakeClient({
        data: {
          status: "pending",
          school_name: "School",
          student_name: "Rahim",
          student_name_bn: null,
          relation: "father",
          expires_at: "2026-10-26",
        },
        error: null,
      }).client,
      "t"
    )
    expect(pending.ok && pending.data.status).toBe("pending")
    const used = await previewGuardianInvitation(
      fakeClient({
        data: { status: "accepted", accepted_by_me: true },
        error: null,
      }).client,
      "t"
    )
    expect(used).toEqual({
      ok: true,
      data: { status: "accepted", acceptedByMe: true },
    })
  })

  it("revokes and lists the family's children", async () => {
    const { client, calls } = fakeClient(
      { data: null, error: null },
      {
        data: [
          {
            id: "s",
            full_name: "Rahim",
            full_name_bn: null,
            student_code: "STU-1",
          },
        ],
        error: null,
      }
    )
    expect((await revokeGuardianLink(CTX, client, "l1")).ok).toBe(true)
    expect(calls[0]?.[0]).toBe("revoke_guardian_link")
    expect(await listFamilyChildren(CTX, client)).toEqual({
      ok: true,
      data: [
        { id: "s", fullName: "Rahim", fullNameBn: null, studentCode: "STU-1" },
      ],
    })
  })
})
