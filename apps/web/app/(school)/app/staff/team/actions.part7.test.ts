// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-03 Part 7 (D-112): removeMember is parse -> context -> can() ->
 * repository, with NO requireWritable (removing access is always allowed).
 * The database rules live in `39c_leave_and_transfer.sql`.
 */

const mockRevalidate = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "admin" }
vi.mock("@/lib/workspace", () => ({ requireWorkspace: async () => ctx }))

const mockRequireWritable = vi.fn()
const mockRemove = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  removeMember: (...a: unknown[]) => mockRemove(...a),
}))

const { removeMember } = await import("./actions")

const MEMBER = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRemove.mockResolvedValue({
    ok: true,
    data: { id: MEMBER, status: "removed" },
  })
})

describe("removeMember", () => {
  it("rejects a malformed id before anything else", async () => {
    const r = await removeMember({ memberId: "nope" })
    expect(!r.ok && r.error.code).toBe("validation_failed")
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it.each(["teacher", "staff", "parent"])("refuses a %s", async (role) => {
    ctx.role = role
    const r = await removeMember({ memberId: MEMBER })
    expect(!r.ok && r.error.code).toBe("forbidden")
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("removes for an owner or admin and never asks requireWritable", async () => {
    for (const role of ["owner", "admin"]) {
      ctx.role = role
      const r = await removeMember({ memberId: MEMBER })
      expect(r).toEqual({ ok: true, data: { id: MEMBER, status: "removed" } })
    }
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockRevalidate).toHaveBeenCalledWith("/app/staff/team")
  })

  it("passes a named repository error through without revalidating", async () => {
    mockRemove.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict",
        message: "x",
        fieldErrors: { _root: ["LAST_OWNER_BLOCKED"] },
      },
    })
    const r = await removeMember({ memberId: MEMBER })
    expect(!r.ok && r.error.fieldErrors?._root).toEqual(["LAST_OWNER_BLOCKED"])
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})
