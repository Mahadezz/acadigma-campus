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

const mockCookieSet = vi.fn()

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: mockCookieSet,
  })),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

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

const { checkEiinAvailability, createSchoolWorkspace } =
  await import("./actions")

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
      expect(result.error.retryAfterSeconds).toBe(137)
      expect(result.error.message).toContain("3 min")
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

describe("createSchoolWorkspace", () => {
  const input = {
    name: "Ideal School & College",
    board: "dhaka",
    medium: "bangla",
    timezone: "Asia/Dhaka",
    working_days: [6, 7, 1, 2, 3, 4],
    academic_year: {
      name: "2026",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
    },
    grade_levels: [
      {
        name: "Class 6",
        name_bn: "ষষ্ঠ শ্রেণি",
        level_number: 6,
        stage: "secondary",
      },
    ],
    idempotency_key: "0b6f4a8e-3c1d-4e2a-9f7b-5d8c6e4a2b10",
  }
  const workspaceId = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

  it("creates the school, makes it the active workspace and lands on /app", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } })
    mockRpc.mockResolvedValue({
      data: { workspace_id: workspaceId, name: input.name, replayed: false },
      error: null,
    })
    mockCookieSet.mockClear()

    const result = await createSchoolWorkspace(input)

    expect(result).toEqual({
      ok: true,
      data: { workspaceId, landingRoute: "/app" },
    })
    expect(mockRpc).toHaveBeenCalledWith("create_school_workspace", {
      p_input: input,
    })
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acadigma_workspace",
      workspaceId,
      expect.objectContaining({ httpOnly: true })
    )
  })

  it("refuses an invalid academic year before reaching the database", async () => {
    mockRpc.mockClear()
    const result = await createSchoolWorkspace({
      ...input,
      academic_year: {
        name: "2026",
        starts_on: "2026-12-31",
        ends_on: "2026-01-01",
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("validation_failed")
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("refuses a payload without grade levels", async () => {
    const result = await createSchoolWorkspace({ ...input, grade_levels: [] })
    expect(result.ok).toBe(false)
  })

  it("requires a signed-in user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockRpc.mockClear()
    const result = await createSchoolWorkspace(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("unauthenticated")
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("does not set the cookie when the database refuses (EIIN_TAKEN)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: FAKE_USER } })
    mockRpc.mockResolvedValue({ data: null, error: { message: "EIIN_TAKEN" } })
    mockCookieSet.mockClear()
    const result = await createSchoolWorkspace(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("conflict")
    expect(mockCookieSet).not.toHaveBeenCalled()
  })
})
