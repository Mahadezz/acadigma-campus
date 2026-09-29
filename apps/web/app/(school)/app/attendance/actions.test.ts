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
const mockDay = vi.fn()
const mockRoll = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  saveAttendance: (...a: unknown[]) => mockSave(...a),
  getAttendanceDay: (...a: unknown[]) => mockDay(...a),
  getRollCall: (...a: unknown[]) => mockRoll(...a),
}))

const { getAttendanceConflict, saveAttendanceSession } =
  await import("./actions")

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
  it("never sends a queued save under another user or workspace (F-ID-11 §5.8)", async () => {
    const W = "11111111-1111-4111-8111-111111111111"
    const U = "22222222-2222-4222-8222-222222222222"
    ctx.workspaceId = W
    ctx.userId = U
    for (const queuedFor of [
      { userId: STUDENT, workspaceId: W },
      { userId: U, workspaceId: STUDENT },
    ]) {
      const result = await saveAttendanceSession({ ...INPUT, queuedFor })
      expect(!result.ok && result.error.fieldErrors?._root).toEqual([
        "WRONG_ACCOUNT",
      ])
    }
    expect(mockSave).not.toHaveBeenCalled()
    const result = await saveAttendanceSession({
      ...INPUT,
      queuedFor: { userId: U, workspaceId: W },
    })
    expect(result.ok).toBe(true)
    ctx.workspaceId = "w"
    ctx.userId = "u"
  })
})

describe("getAttendanceConflict (F-ID-11 §4.5, D-310)", () => {
  const SECTION = INPUT.sectionId
  const session = {
    id: "sess",
    updatedAt: "2026-09-25T03:12:00Z",
    takenByName: "Nadia",
  }

  it("returns the colleague's register: version, who took it, every status", async () => {
    mockDay.mockResolvedValue({
      ok: true,
      data: { sections: [{ sectionId: SECTION, session }] },
    })
    mockRoll.mockResolvedValue({
      ok: true,
      data: [{ studentId: STUDENT, fullName: "Rahim", status: "absent" }],
    })
    const result = await getAttendanceConflict({
      sectionId: SECTION,
      date: INPUT.date,
    })
    expect(result).toEqual({
      ok: true,
      data: {
        updatedAt: session.updatedAt,
        takenByName: "Nadia",
        students: [{ studentId: STUDENT, fullName: "Rahim", status: "absent" }],
      },
    })
    expect(mockDay.mock.calls[0]?.[2]).toBe(INPUT.date)
    expect(mockRoll.mock.calls[0]?.slice(2)).toEqual([
      SECTION,
      INPUT.date,
      "sess",
    ])
  })

  it("refuses a caller who cannot read attendance, and bad input", async () => {
    ctx.role = "parent"
    const denied = await getAttendanceConflict({
      sectionId: SECTION,
      date: INPUT.date,
    })
    expect(!denied.ok && denied.error.code).toBe("forbidden")
    ctx.role = "teacher"
    const bad = await getAttendanceConflict({ sectionId: "x", date: "y" })
    expect(!bad.ok && bad.error.code).toBe("validation_failed")
    expect(mockDay).not.toHaveBeenCalled()
  })

  it("no register on the server (nothing to compare) is not_found", async () => {
    mockDay.mockResolvedValue({
      ok: true,
      data: { sections: [{ sectionId: SECTION, session: null }] },
    })
    const result = await getAttendanceConflict({
      sectionId: SECTION,
      date: INPUT.date,
    })
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})
