import { describe, expect, it, vi } from "vitest"

import { runTrialExpiryJob } from "./billing-jobs"

import type { AcadigmaSupabaseClient } from "../client"

function fakeClient(rpcResult: {
  data?: unknown
  error?: unknown
}): AcadigmaSupabaseClient {
  return {
    rpc: vi.fn(async () => rpcResult),
  } as unknown as AcadigmaSupabaseClient
}

describe("runTrialExpiryJob", () => {
  it("calls the public.expire_pro_trials RPC and reports the count", async () => {
    const client = fakeClient({ data: 3, error: null })

    const result = await runTrialExpiryJob(client)

    expect(client.rpc).toHaveBeenCalledWith("expire_pro_trials")
    expect(result).toEqual({ ok: true, data: { trialsExpired: 3 } })
  })

  it("reports zero trials expired without treating it as an error", async () => {
    const client = fakeClient({ data: 0, error: null })

    const result = await runTrialExpiryJob(client)

    expect(result).toEqual({ ok: true, data: { trialsExpired: 0 } })
  })

  it("maps an RPC error to dependency_unavailable", async () => {
    const client = fakeClient({
      data: null,
      error: { message: "permission denied for function expire_pro_trials" },
    })

    const result = await runTrialExpiryJob(client)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("dependency_unavailable")
    }
  })

  it("fails as internal if the RPC ever returns a non-numeric shape", async () => {
    const client = fakeClient({ data: "not-a-number", error: null })

    const result = await runTrialExpiryJob(client)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("internal")
    }
  })
})
