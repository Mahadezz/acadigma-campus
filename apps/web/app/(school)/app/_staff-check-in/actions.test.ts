// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-04 Part 1: context -> can("staff_attendance.self") -> requireWritable
 * -> repository. A parent or a read-only workspace never reaches the RPC.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = {
  workspaceId: "w",
  userId: "u",
  role: "teacher",
  workspaceType: "school",
  plan: "pro",
}
vi.mock("@/lib/workspace", () => ({ requireWorkspace: async () => ctx }))

const mockRequireWritable = vi.fn()
const mockIn = vi.fn()
const mockOut = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  staffCheckIn: (...a: unknown[]) => mockIn(...a),
  staffCheckOut: (...a: unknown[]) => mockOut(...a),
}))

const { checkInToday, checkOutToday } = await import("./actions")

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "teacher"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockIn.mockResolvedValue({ ok: true, data: { id: "r" } })
  mockOut.mockResolvedValue({ ok: true, data: { id: "r" } })
})

describe("checkInToday / checkOutToday", () => {
  it("refuse a parent before any database call", async () => {
    ctx.role = "parent"
    const a = await checkInToday()
    const b = await checkOutToday()
    expect(!a.ok && a.error.code).toBe("forbidden")
    expect(!b.ok && b.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockIn).not.toHaveBeenCalled()
    expect(mockOut).not.toHaveBeenCalled()
  })

  it("refuse a read-only workspace", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await checkInToday()
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockIn).not.toHaveBeenCalled()
  })

  it.each(["owner", "admin", "teacher", "staff"])(
    "let a %s check in and out",
    async (role) => {
      ctx.role = role
      expect((await checkInToday()).ok).toBe(true)
      expect((await checkOutToday()).ok).toBe(true)
      expect(mockIn).toHaveBeenCalledOnce()
      expect(mockOut).toHaveBeenCalledOnce()
    }
  )
})
