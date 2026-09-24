import { describe, expect, it, vi } from "vitest"

import { checkEiinAvailability } from "./school"

import type { AcadigmaSupabaseClient } from "../client"

function fakeClient(rpcResult: {
  data?: unknown
  error?: unknown
}): AcadigmaSupabaseClient {
  return {
    rpc: vi.fn(async () => rpcResult),
  } as unknown as AcadigmaSupabaseClient
}

describe("checkEiinAvailability", () => {
  it("calls public.check_eiin_available and reports availability", async () => {
    const client = fakeClient({ data: true, error: null })

    const result = await checkEiinAvailability(client, "123456")

    expect(client.rpc).toHaveBeenCalledWith("check_eiin_available", {
      eiin: "123456",
    })
    expect(result).toEqual({ ok: true, data: { available: true } })
  })

  it("reports an EIIN already taken", async () => {
    const client = fakeClient({ data: false, error: null })

    const result = await checkEiinAvailability(client, "123456")

    expect(result).toEqual({ ok: true, data: { available: false } })
  })

  it("maps an RPC error to dependency_unavailable", async () => {
    const client = fakeClient({
      data: null,
      error: { message: "permission denied for function check_eiin_available" },
    })

    const result = await checkEiinAvailability(client, "123456")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("dependency_unavailable")
    }
  })
})
