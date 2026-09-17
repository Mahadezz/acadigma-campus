import { describe, expect, it, vi } from "vitest"

import { setCorrelationId } from "./audit-context"

import type { AcadigmaSupabaseClient } from "./client"

describe("setCorrelationId", () => {
  it("calls the set_correlation_id RPC with the given id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const client = { rpc } as unknown as AcadigmaSupabaseClient

    await setCorrelationId(client, "11111111-1111-1111-1111-111111111111")

    expect(rpc).toHaveBeenCalledWith("set_correlation_id", {
      p_correlation_id: "11111111-1111-1111-1111-111111111111",
    })
  })
})
