// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-03 Part 5 (D-110): parse -> context -> can() -> requireWritable ->
 * repository -> revalidate. A teacher or a read-only school never reaches
 * the repository.
 */

const mockRevalidate = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "admin" }
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: async () => ctx,
}))

const mockRequireWritable = vi.fn()
const mockApprove = vi.fn()
const mockReject = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  approveMember: (...a: unknown[]) => mockApprove(...a),
  rejectMember: (...a: unknown[]) => mockReject(...a),
}))

const { approveMember, rejectMember } = await import("./actions")

const MEMBER = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockApprove.mockResolvedValue({
    ok: true,
    data: { id: MEMBER, status: "active" },
  })
  mockReject.mockResolvedValue({
    ok: true,
    data: { id: MEMBER, status: "removed" },
  })
})

describe.each([
  ["approveMember", approveMember, mockApprove, "active"],
  ["rejectMember", rejectMember, mockReject, "removed"],
] as const)("%s", (_, action, repo, status) => {
  it("rejects a malformed id before anything else", async () => {
    const r = await action({ memberId: "nope" })
    expect(!r.ok && r.error.code).toBe("validation_failed")
    expect(repo).not.toHaveBeenCalled()
  })

  it.each(["teacher", "staff", "parent"])(
    "refuses a %s before touching the database",
    async (role) => {
      ctx.role = role
      const r = await action({ memberId: MEMBER })
      expect(!r.ok && r.error.code).toBe("forbidden")
      expect(mockRequireWritable).not.toHaveBeenCalled()
      expect(repo).not.toHaveBeenCalled()
    }
  )

  it("refuses a read-only school (D-300)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const r = await action({ memberId: MEMBER })
    expect(!r.ok && r.error.code).toBe("payment_required")
    expect(repo).not.toHaveBeenCalled()
  })

  it("decides through the repository with the context and revalidates", async () => {
    const r = await action({ memberId: MEMBER })
    expect(r).toEqual({ ok: true, data: { id: MEMBER, status } })
    expect(repo).toHaveBeenCalledWith(ctx, {}, MEMBER)
    expect(mockRevalidate).toHaveBeenCalledWith("/app/staff/team")
  })
})
