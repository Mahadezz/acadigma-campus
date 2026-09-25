// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-03 demo cut (D-104): parse -> context -> can() -> requireWritable
 * -> repository. Staff or a read-only school never reach the RPC.
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
  saveAttendance: (...a: unknown[]) => mockSave(...a),
}))

const { saveAttendanceSession } = await import("./actions")

const STUDENT = "55555555-5555-4555-8555-555555555555"
const INPUT = {
  idempotencyKey: "66666666-6666-4666-8666-666666666666",
  sectionId: "33333333-3333-4333-8333-333333333333",
  date: "2026-09-25",
  records: [{ studentId: STUDENT, status: "present" }],
  bulkMarked: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "teacher"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockSave.mockResolvedValue({ ok: true, data: { sessionId: "s" } })
})

describe("saveAttendanceSession", () => {
  it("saves for a teacher, defaulting the optional flags", async () => {
    const result = await saveAttendanceSession(INPUT)
    expect(result.ok).toBe(true)
    expect(mockSave.mock.calls[0]?.[2]).toMatchObject({
      allowNonSchoolDay: false,
      expectedUpdatedAt: null,
    })
  })

  it("refuses an unmarked student before touching anything (D-22)", async () => {
    const result = await saveAttendanceSession({
      ...INPUT,
      records: [{ studentId: STUDENT, status: null }],
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("refuses staff before touching the database", async () => {
    ctx.role = "staff"
    const result = await saveAttendanceSession(INPUT)
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
  })

  it("refuses a read-only school (D-300)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await saveAttendanceSession(INPUT)
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockSave).not.toHaveBeenCalled()
  })
})
