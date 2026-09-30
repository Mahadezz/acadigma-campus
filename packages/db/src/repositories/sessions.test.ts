import { describe, expect, it } from "vitest"

import {
  listMySessions,
  noteSignIn,
  revokeAllMySessions,
  revokeMySession,
} from "./sessions"

import type { AcadigmaSupabaseClient } from "../client"

const SESSION_ID = "0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"

type RpcResult = { data: unknown; error: { message: string } | null }

function rpcClient(
  results: Record<string, RpcResult>,
  calls: { fn: string; args: unknown }[] = []
): AcadigmaSupabaseClient {
  return {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args })
      const r = results[fn]
      if (!r) throw new Error(`unexpected rpc ${fn}`)
      return r
    },
  } as unknown as AcadigmaSupabaseClient
}

describe("listMySessions", () => {
  it("maps rows and turns the user agent into a label", async () => {
    const result = await listMySessions(
      rpcClient({
        my_sessions: {
          data: [
            {
              id: SESSION_ID,
              created_at: "2026-09-30T10:00:00Z",
              last_active_at: "2026-10-01T08:00:00Z",
              user_agent:
                "Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36",
              is_current: true,
            },
          ],
          error: null,
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: SESSION_ID,
          label: "Chrome on Android",
          createdAt: "2026-09-30T10:00:00Z",
          lastActiveAt: "2026-10-01T08:00:00Z",
          isCurrent: true,
        },
      ],
    })
  })

  it("returns a generic error when the database fails", async () => {
    const result = await listMySessions(
      rpcClient({ my_sessions: { data: null, error: { message: "boom" } } })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("revokeMySession", () => {
  it("passes only the session id and reports whether one was revoked", async () => {
    const calls: { fn: string; args: unknown }[] = []
    const result = await revokeMySession(
      rpcClient({ revoke_my_session: { data: true, error: null } }, calls),
      SESSION_ID
    )
    expect(calls).toEqual([
      { fn: "revoke_my_session", args: { p_session_id: SESSION_ID } },
    ])
    expect(result).toEqual({ ok: true, data: { revoked: true } })
  })

  it("treats nothing matched as a success", async () => {
    const result = await revokeMySession(
      rpcClient({ revoke_my_session: { data: false, error: null } }),
      SESSION_ID
    )
    expect(result).toEqual({ ok: true, data: { revoked: false } })
  })

  it("returns a generic error when the database fails", async () => {
    const result = await revokeMySession(
      rpcClient({ revoke_my_session: { data: null, error: { message: "x" } } }),
      SESSION_ID
    )
    expect(result.ok).toBe(false)
  })
})

describe("noteSignIn", () => {
  it("reports whether a notification was raised", async () => {
    expect(
      await noteSignIn(rpcClient({ note_sign_in: { data: true, error: null } }))
    ).toEqual({ ok: true, data: { notified: true } })
    const failed = await noteSignIn(
      rpcClient({ note_sign_in: { data: null, error: { message: "x" } } })
    )
    expect(failed.ok).toBe(false)
  })
})

describe("revokeAllMySessions", () => {
  it("returns how many sessions ended, or a generic error", async () => {
    expect(
      await revokeAllMySessions(
        rpcClient({ revoke_all_my_sessions: { data: 3, error: null } })
      )
    ).toEqual({ ok: true, data: { revoked: 3 } })
    const failed = await revokeAllMySessions(
      rpcClient({
        revoke_all_my_sessions: { data: null, error: { message: "x" } },
      })
    )
    expect(failed.ok).toBe(false)
  })
})
