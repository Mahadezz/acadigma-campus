// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-03 Part 7 (D-112): leaveWorkspace (no requireWritable, drops the
 * workspace cookie) and transferOwnership (requireWritable → typed name →
 * throttled password re-auth → repository, in that order).
 */

const mockRevalidate = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }))

const cookieDelete = vi.fn()
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: cookieDelete }),
}))

const getUser = vi.fn()
const signIn = vi.fn()
const client = { auth: { getUser, signInWithPassword: signIn } }
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }))

const ctx = { workspaceId: "w", userId: "u", role: "owner" }
vi.mock("@/lib/workspace", () => ({ requireWorkspace: async () => ctx }))
vi.mock("@/lib/resolve-landing-route", () => ({
  resolveLandingRoute: async () => "/personal",
}))

const throttleStatus = vi.fn()
const throttleRecordFailure = vi.fn()
vi.mock("@/lib/throttle", () => ({
  USER_THROTTLE_KEYS: { changePassword: "user:changePassword" },
  throttleStatus: (...a: unknown[]) => throttleStatus(...a),
  throttleRecordFailure: (...a: unknown[]) => throttleRecordFailure(...a),
}))
vi.mock("@/lib/i18n", () => ({
  getMessages: async () => ({
    locale: "en",
    t: { auth: { login: { throttled: "Wait {time}" } } },
  }),
}))
vi.mock("@/lib/throttle-copy", () => ({ throttledMessage: () => "Wait" }))

const mockRequireWritable = vi.fn()
const mockLeave = vi.fn()
const mockTransfer = vi.fn()
const mockName = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  leaveWorkspace: (...a: unknown[]) => mockLeave(...a),
  transferOwnership: (...a: unknown[]) => mockTransfer(...a),
  getWorkspaceName: (...a: unknown[]) => mockName(...a),
}))

const { leaveWorkspace, transferOwnership } = await import("./actions")

const MEMBER = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"
const INPUT = {
  memberId: MEMBER,
  keepOwner: false,
  currentPassword: "correct horse",
  confirmName: "  green  valley school ",
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "owner"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockLeave.mockResolvedValue({ ok: true, data: { workspaceId: "w" } })
  mockTransfer.mockResolvedValue({ ok: true, data: { id: MEMBER } })
  mockName.mockResolvedValue({ ok: true, data: "Green Valley School" })
  getUser.mockResolvedValue({ data: { user: { email: "o@test.local" } } })
  signIn.mockResolvedValue({ error: null })
  throttleStatus.mockResolvedValue({ blocked: false, retryAfterSeconds: 0 })
})

describe("leaveWorkspace", () => {
  it("leaves, drops the workspace cookie and returns the next landing route", async () => {
    const r = await leaveWorkspace()
    expect(r).toEqual({ ok: true, data: { landingRoute: "/personal" } })
    expect(cookieDelete).toHaveBeenCalledWith("acadigma_workspace")
    expect(mockRequireWritable).not.toHaveBeenCalled()
  })

  it("keeps the cookie when the database refuses (sole owner)", async () => {
    mockLeave.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict",
        message: "x",
        fieldErrors: { _root: ["LAST_OWNER_BLOCKED"] },
      },
    })
    const r = await leaveWorkspace()
    expect(!r.ok && r.error.fieldErrors?._root).toEqual(["LAST_OWNER_BLOCKED"])
    expect(cookieDelete).not.toHaveBeenCalled()
  })
})

describe("transferOwnership", () => {
  it("rejects bad input before anything else", async () => {
    const r = await transferOwnership({ ...INPUT, currentPassword: "" })
    expect(!r.ok && r.error.code).toBe("validation_failed")
    expect(mockTransfer).not.toHaveBeenCalled()
  })

  it.each(["admin", "teacher", "staff", "parent"])(
    "refuses a %s",
    async (role) => {
      ctx.role = role
      const r = await transferOwnership(INPUT)
      expect(!r.ok && r.error.code).toBe("forbidden")
      expect(signIn).not.toHaveBeenCalled()
    }
  )

  it("stops on a read-only plan before checking the password", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { reason: "Trial ended" },
    })
    const r = await transferOwnership(INPUT)
    expect(!r.ok && r.error.code).toBe("payment_required")
    expect(signIn).not.toHaveBeenCalled()
  })

  it("refuses a wrong school name without a password attempt", async () => {
    const r = await transferOwnership({ ...INPUT, confirmName: "Other" })
    expect(!r.ok && r.error.fieldErrors?._root).toEqual([
      "CONFIRM_NAME_MISMATCH",
    ])
    expect(signIn).not.toHaveBeenCalled()
  })

  it("refuses while throttled without a password attempt", async () => {
    throttleStatus.mockResolvedValue({ blocked: true, retryAfterSeconds: 60 })
    const r = await transferOwnership(INPUT)
    expect(!r.ok && r.error.code).toBe("rate_limited")
    expect(signIn).not.toHaveBeenCalled()
  })

  it("records a failure and never transfers on a wrong password", async () => {
    signIn.mockResolvedValue({ error: { message: "bad" } })
    const r = await transferOwnership(INPUT)
    expect(!r.ok && r.error.fieldErrors?._root).toEqual(["REAUTH_FAILED"])
    expect(throttleRecordFailure).toHaveBeenCalledWith(
      client,
      "changePassword",
      "user:changePassword"
    )
    expect(mockTransfer).not.toHaveBeenCalled()
  })

  it("transfers after the name (case/spacing-insensitive) and password check", async () => {
    const r = await transferOwnership(INPUT)
    expect(r).toEqual({ ok: true, data: { id: MEMBER } })
    expect(signIn).toHaveBeenCalledWith({
      email: "o@test.local",
      password: "correct horse",
    })
    expect(mockTransfer).toHaveBeenCalledWith(ctx, client, {
      memberId: MEMBER,
      keepOwner: false,
    })
    expect(mockRevalidate).toHaveBeenCalledWith("/app/staff/team")
  })
})
