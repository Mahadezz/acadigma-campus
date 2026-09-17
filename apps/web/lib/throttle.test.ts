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
 * Security review N2 / the throttle fix in migration 20260917020000 §3: limits
 * are server-side constants now, not caller-supplied arguments. These tests
 * assert the client-side half of that: `throttleRecordFailure` must send only
 * `p_bucket` and `p_key` to `throttle_record_failure` — never a limit, a window
 * or a block duration — for every bucket this module knows about.
 */
function fakeSupabase(
  rpcResult: { data: unknown; error: { message: string } | null } = {
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
