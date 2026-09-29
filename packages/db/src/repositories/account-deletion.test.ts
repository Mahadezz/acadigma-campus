import { describe, expect, it } from "vitest"

import {
  cancelAccountDeletion,
  getPendingAccountDeletion,
  listAccountDeletionBlockers,
  requestAccountDeletion,
} from "./account-deletion"

import type { AcadigmaSupabaseClient } from "../client"

const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"
const WS_ID = "1c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

type RpcResult = {
  data: unknown
  error: { message: string; code?: string } | null
}

function rpcClient(results: Record<string, RpcResult>): AcadigmaSupabaseClient {
  return {
    rpc: async (fn: string) => {
      const r = results[fn]
      if (!r) throw new Error(`unexpected rpc ${fn}`)
      return r
    },
  } as unknown as AcadigmaSupabaseClient
}

function selectClient(
  row: { scheduled_purge_at: string } | null,
  error = false,
  seen: string[] = []
): AcadigmaSupabaseClient {
  const chain = {
    eq: (col: string, value: string) => {
      seen.push(`${col}=${value}`)
      return chain
    },
    maybeSingle: async () => ({
      data: error ? null : row,
      error: error ? { message: "down" } : null,
    }),
  }
  return {
    from: (table: string) => {
      if (table !== "account_deletion_requests") throw new Error(table)
      return { select: () => chain }
    },
  } as unknown as AcadigmaSupabaseClient
}

describe("getPendingAccountDeletion", () => {
  it("returns the date, filtered to the caller's own pending row", async () => {
    const seen: string[] = []
    const result = await getPendingAccountDeletion(
      selectClient({ scheduled_purge_at: "2026-10-29T18:00:00Z" }, false, seen),
      USER_ID
    )
    expect(result).toEqual({
      ok: true,
      data: { scheduledPurgeAt: "2026-10-29T18:00:00Z" },
    })
    expect(seen).toEqual([`user_id=${USER_ID}`, "status=pending"])
  })

  it("returns null when nothing is scheduled, and an error when the read fails", async () => {
    expect(
      await getPendingAccountDeletion(selectClient(null), USER_ID)
    ).toEqual({
      ok: true,
      data: null,
    })
    const failed = await getPendingAccountDeletion(
      selectClient(null, true),
      USER_ID
    )
    expect(failed.ok).toBe(false)
  })
})

describe("listAccountDeletionBlockers", () => {
  it("maps rows to camelCase", async () => {
    const result = await listAccountDeletionBlockers(
      rpcClient({
        account_deletion_blockers: {
          data: [{ workspace_id: WS_ID, name: "Solo School" }],
          error: null,
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      data: [{ workspaceId: WS_ID, name: "Solo School" }],
    })
  })
})

describe("requestAccountDeletion", () => {
  it("returns the purge date", async () => {
    const result = await requestAccountDeletion(
      rpcClient({
        request_account_deletion: { data: "2026-10-29T18:00:00Z", error: null },
      })
    )
    expect(result).toEqual({
      ok: true,
      data: { scheduledPurgeAt: "2026-10-29T18:00:00Z" },
    })
  })

  it.each([
    [{ message: "SOLE_OWNER_BLOCKED", code: "P0001" }, "forbidden"],
    [{ message: "RATE_LIMITED", code: "54000" }, "rate_limited"],
    [{ message: "connection reset" }, "dependency_unavailable"],
  ])("maps %o to %s", async (error, code) => {
    const result = await requestAccountDeletion(
      rpcClient({ request_account_deletion: { data: null, error } })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })
})

describe("cancelAccountDeletion", () => {
  it("reports whether a pending request was cancelled", async () => {
    expect(
      await cancelAccountDeletion(
        rpcClient({ cancel_account_deletion: { data: true, error: null } })
      )
    ).toEqual({ ok: true, data: { cancelled: true } })
    expect(
      await cancelAccountDeletion(
        rpcClient({ cancel_account_deletion: { data: false, error: null } })
      )
    ).toEqual({ ok: true, data: { cancelled: false } })
  })

  it("returns an error when the call fails", async () => {
    const result = await cancelAccountDeletion(
      rpcClient({
        cancel_account_deletion: { data: null, error: { message: "down" } },
      })
    )
    expect(result.ok).toBe(false)
  })
})
