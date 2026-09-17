// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import {
  throttleRecordFailure,
  throttleReset,
  throttleStatus,
  type ThrottleBucket,
} from "./throttle"

import type { AcadigmaSupabaseClient } from "@acadigma/db"

/**
 * `requestLogger` (security review N3's fail-closed logging) calls Next's
 * `headers()` internally, which throws outside a real request. Mocked so the
 * fail-closed tests below can assert a warning was logged without needing a
 * Next.js request context. `vi.mock` is hoisted above the imports above by
 * vitest, so this runs before `./throttle` is evaluated.
 */
// Vitest only allows `mock`-prefixed variables inside a hoisted vi.mock factory.
const mockWarn = vi.fn()
vi.mock("@/lib/logger", () => ({
  requestLogger: vi.fn(async () => ({ warn: mockWarn })),
}))

/**
 * Security review N2 / the throttle fix in migration 20260917020000 §3: limits
 * are server-side constants now, not caller-supplied arguments. These tests
 * assert the client-side half of that: `throttleRecordFailure` must send only
 * `p_bucket` and `p_key` to `throttle_record_failure` — never a limit, a window
 * or a block duration — for every bucket this module knows about.
 */
function fakeSupabase(
  rpcResult: {
    data: unknown
    error: { message: string; code?: string } | null
  } = {
    data: { blocked: false, retry_after_seconds: 0 },
    error: null,
  }
): { rpc: ReturnType<typeof vi.fn> } & Pick<AcadigmaSupabaseClient, "rpc"> {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  return { rpc } as unknown as {
    rpc: ReturnType<typeof vi.fn>
  } & Pick<AcadigmaSupabaseClient, "rpc">
}

const BUCKETS: ThrottleBucket[] = [
  "register",
  "loginByEmail",
  "loginByIp",
  "passwordResetRequest",
  "passwordResetSubmit",
  "resendVerification",
  "changePassword",
]

describe("throttleRecordFailure", () => {
  it.each(BUCKETS)(
    "sends only p_bucket and p_key for bucket %s -- no limit/window params",
    async (bucket) => {
      const supabase = fakeSupabase()
      await throttleRecordFailure(
        supabase as unknown as AcadigmaSupabaseClient,
        bucket,
        "some-key"
      )

      expect(supabase.rpc).toHaveBeenCalledTimes(1)
      const [fn, args] = supabase.rpc.mock.calls[0] as [string, unknown]
      expect(fn).toBe("throttle_record_failure")
      expect(args).toEqual({ p_bucket: bucket, p_key: "some-key" })
      // Explicitly prove the old caller-supplied-limit shape is gone.
      expect(args).not.toHaveProperty("p_max_attempts")
      expect(args).not.toHaveProperty("p_window_seconds")
      expect(args).not.toHaveProperty("p_block_seconds")
    }
  )

  it("returns the server's blocked/retry-after verbatim on success", async () => {
    const supabase = fakeSupabase({
      data: { blocked: true, retry_after_seconds: 42 },
      error: null,
    })
    const result = await throttleRecordFailure(
      supabase as unknown as AcadigmaSupabaseClient,
      "loginByEmail",
      "k"
    )
    expect(result).toEqual({ blocked: true, retryAfterSeconds: 42 })
  })
})

describe("throttleStatus and throttleReset", () => {
  it("throttleStatus sends only p_key", async () => {
    const supabase = fakeSupabase()
    await throttleStatus(supabase as unknown as AcadigmaSupabaseClient, "k")
    expect(supabase.rpc).toHaveBeenCalledWith("throttle_status", { p_key: "k" })
  })

  it("throttleReset sends only p_key", async () => {
    const supabase = fakeSupabase({ data: null, error: null })
    await throttleReset(supabase as unknown as AcadigmaSupabaseClient, "k")
    expect(supabase.rpc).toHaveBeenCalledWith("throttle_reset", { p_key: "k" })
  })
})

/**
 * Security review N3: the module used to fail OPEN (silently return
 * `{ blocked: false }`) on any RPC error or shape drift, which meant sign-in's
 * rate limiter could go missing with nothing going red. It now fails CLOSED
 * (a generic "too many attempts" delay) and logs. Both paths -- the RPC
 * succeeding and the RPC erroring -- are asserted below.
 */
describe("throttleStatus fails closed on an RPC error (N3)", () => {
  it("the success path is unaffected: a real 'not blocked' answer passes through", async () => {
    const supabase = fakeSupabase({
      data: { blocked: false, retry_after_seconds: 0 },
      error: null,
    })
    const result = await throttleStatus(
      supabase as unknown as AcadigmaSupabaseClient,
      "k"
    )
    expect(result).toEqual({ blocked: false, retryAfterSeconds: 0 })
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("an RPC error is treated as throttled, not as unthrottled", async () => {
    mockWarn.mockClear()
    const supabase = fakeSupabase({
      data: null,
      error: { message: "connection reset", code: "08006" },
    })
    const result = await throttleStatus(
      supabase as unknown as AcadigmaSupabaseClient,
      "k"
    )
    expect(result.blocked).toBe(true)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(mockWarn).toHaveBeenCalledTimes(1)
    const [meta] = mockWarn.mock.calls[0] as [Record<string, unknown>]
    expect(meta["fn"]).toBe("throttle_status")
    expect(meta["kind"]).toBe("rpc_error")
  })

  it("a shape drift (unparseable row) is also treated as throttled", async () => {
    mockWarn.mockClear()
    const supabase = fakeSupabase({ data: { nonsense: true }, error: null })
    const result = await throttleStatus(
      supabase as unknown as AcadigmaSupabaseClient,
      "k"
    )
    expect(result.blocked).toBe(true)
    expect(mockWarn).toHaveBeenCalledTimes(1)
    const [meta] = mockWarn.mock.calls[0] as [Record<string, unknown>]
    expect(meta["kind"]).toBe("shape_drift")
  })
})

describe("throttleRecordFailure fails closed on an RPC error (N3)", () => {
  it("an RPC error is treated as throttled", async () => {
    mockWarn.mockClear()
    const supabase = fakeSupabase({
      data: null,
      error: { message: "function does not exist", code: "42883" },
    })
    const result = await throttleRecordFailure(
      supabase as unknown as AcadigmaSupabaseClient,
      "loginByEmail",
      "k"
    )
    expect(result.blocked).toBe(true)
    expect(mockWarn).toHaveBeenCalledTimes(1)
    const [meta] = mockWarn.mock.calls[0] as [Record<string, unknown>]
    expect(meta["fn"]).toBe("throttle_record_failure")
    expect(meta["kind"]).toBe("rpc_error")
  })
})
