// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

/**
 * PR #34 follow-up (security review, medium) / D-67: `checkEiinAvailability`
 * now runs through the `eiinCheck` throttle bucket before calling
 * `public.check_eiin_available` at all — the boolean-only RPC has no rate
 * limit of its own, so an unthrottled caller could enumerate which EIINs
 * are already on the platform. This suite proves the blocked path: a
 * blocked caller gets `rate_limited` back and the underlying RPC is never
 * reached, plus the allowed path records the attempt (bucket `eiinCheck`)
 * BEFORE calling the RPC, unconditionally — every call counts, not just a
 * failed one, since the thing being capped is enumeration volume.
 */

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}))

const mockGetUser = vi.fn()
const mockRpc = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  })),
}))

const mockThrottleStatus = vi.fn()
const mockThrottleRecordFailure = vi.fn()

vi.mock("@/lib/throttle", () => ({
  throttleStatus: mockThrottleStatus,
  throttleRecordFailure: mockThrottleRecordFailure,
}))

const { checkEiinAvailability } = await import("./actions")

const FAKE_USER = { id: "11111111-1111-1111-1111-111111111111" }

describe("checkEiinAvailability", () => {
  it("returns rate_limited and never calls the RPC when the eiinCheck bucket is blocked", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } })
    mockThrottleStatus.mockResolvedValue({
      blocked: true,
      retryAfterSeconds: 137,
    })

    const result = await checkEiinAvailability({ eiin: "123456" })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limited")
      expect(result.error.message).toContain("137")
    }
    expect(mockThrottleRecordFailure).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("keys the throttle check per user id, not per IP", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } })
    mockThrottleStatus.mockResolvedValue({
      blocked: true,
      retryAfterSeconds: 1,
    })

    await checkEiinAvailability({ eiin: "123456" })

    const [, key] = mockThrottleStatus.mock.calls[0] as [unknown, string]
    expect(typeof key).toBe("string")
    expect(key.startsWith("eiin-check:")).toBe(true)
  })

  it("when not blocked, records the attempt (bucket eiinCheck) before calling the RPC", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } })
    mockThrottleStatus.mockResolvedValue({
      blocked: false,
      retryAfterSeconds: 0,
    })
    mockThrottleRecordFailure.mockResolvedValue({
      blocked: false,
      retryAfterSeconds: 0,
    })
    mockRpc.mockResolvedValue({ data: true, error: null })

    const callOrder: string[] = []
    mockThrottleRecordFailure.mockImplementation(async () => {
      callOrder.push("throttleRecordFailure")
      return { blocked: false, retryAfterSeconds: 0 }
    })
    mockRpc.mockImplementation(async () => {
      callOrder.push("rpc")
      return { data: true, error: null }
    })

    const result = await checkEiinAvailability({ eiin: "123456" })

    expect(result.ok).toBe(true)
    expect(mockThrottleRecordFailure).toHaveBeenCalledWith(
      expect.anything(),
      "eiinCheck",
      expect.stringContaining("eiin-check:")
    )
    expect(callOrder).toEqual(["throttleRecordFailure", "rpc"])
  })
})
