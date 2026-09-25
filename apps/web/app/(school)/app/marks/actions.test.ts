// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-06 Part 3 (D-304): parse -> context -> can() -> requireWritable
 * -> repository. Staff, parents or a read-only school never reach the RPC.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "teacher" }
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: async () => ctx,
}))

const mockRequireWritable = vi.fn()
const mockSave = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
}))
vi.mock("@acadigma/db/repositories/marks", () => ({
  saveMarks: (...a: unknown[]) => mockSave(...a),
}))

const { saveMarks } = await import("./actions")

const ENTRY = {
  studentId: "55555555-5555-4555-8555-555555555555",
  status: "entered",
  obtained: 45.5,
  expectedUpdatedAt: null,
}
const INPUT = {
  idempotencyKey: "66666666-6666-4666-8666-666666666666",
  examSubjectId: "33333333-3333-4333-8333-333333333333",
  entries: [ENTRY],
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "teacher"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockSave.mockResolvedValue({ ok: true, data: { saved: 1 } })
})

describe("saveMarks", () => {
  it("saves for a teacher", async () => {
    const result = await saveMarks(INPUT)
    expect(result.ok).toBe(true)
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it.each([
    { status: "entered", obtained: null },
    { status: "absent", obtained: 3 },
    { status: "entered", obtained: 4.555 },
    { status: "entered", obtained: -1 },
  ])("refuses an invalid entry %j before touching anything", async (patch) => {
    const result = await saveMarks({
      ...INPUT,
      entries: [{ ...ENTRY, ...patch }],
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockSave).not.toHaveBeenCalled()
  })

  it.each(["staff", "parent"])(
    "refuses %s before the database",
    async (role) => {
      ctx.role = role
      const result = await saveMarks(INPUT)
      expect(!result.ok && result.error.code).toBe("forbidden")
      expect(mockRequireWritable).not.toHaveBeenCalled()
    }
  )

  it("refuses a read-only school (D-300)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await saveMarks(INPUT)
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockSave).not.toHaveBeenCalled()
  })
})
