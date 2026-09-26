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
const mockSubmit = vi.fn()
const mockLock = vi.fn()
const mockUnlock = vi.fn()
const mockReopen = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
}))
vi.mock("@acadigma/db/repositories/marks", () => ({
  saveMarks: (...a: unknown[]) => mockSave(...a),
  submitExamSubject: (...a: unknown[]) => mockSubmit(...a),
  lockExamSubject: (...a: unknown[]) => mockLock(...a),
  unlockExamSubject: (...a: unknown[]) => mockUnlock(...a),
  setEntryClosesOn: (...a: unknown[]) => mockReopen(...a),
}))

const {
  saveMarks,
  submitExamSubject,
  lockExamSubject,
  unlockExamSubject,
  reopenMarksEntry,
} = await import("./actions")

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
  mockSubmit.mockResolvedValue({
    ok: true,
    data: { submitted: true, missing: [] },
  })
  mockLock.mockResolvedValue({ ok: true, data: undefined })
  mockUnlock.mockResolvedValue({ ok: true, data: undefined })
  mockReopen.mockResolvedValue({ ok: true, data: undefined })
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

const PAPER = "33333333-3333-4333-8333-333333333333"

describe("saveMarks late reason (D-307)", () => {
  it("passes a trimmed reason through and refuses a blank one", async () => {
    ctx.role = "admin"
    await saveMarks({ ...INPUT, lateReason: "  Script found late " })
    expect(mockSave.mock.calls[0]?.[2]).toMatchObject({
      lateReason: "Script found late",
    })
    const blank = await saveMarks({ ...INPUT, lateReason: "   " })
    expect(!blank.ok && blank.error.code).toBe("validation_failed")
  })
})

describe("submitExamSubject (D-307)", () => {
  it("submits for a teacher, unconfirmed by default", async () => {
    const result = await submitExamSubject({ examSubjectId: PAPER })
    expect(result.ok).toBe(true)
    expect(mockSubmit).toHaveBeenCalledWith(ctx, {}, PAPER, false)
  })

  it.each(["staff", "parent"])("refuses %s", async (role) => {
    ctx.role = role
    const result = await submitExamSubject({ examSubjectId: PAPER })
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})

describe("lockExamSubject / unlockExamSubject (D-307)", () => {
  it("refuses a teacher (marks.lock is owner/admin)", async () => {
    expect((await lockExamSubject({ examSubjectId: PAPER })).ok).toBe(false)
    expect(
      (await unlockExamSubject({ examSubjectId: PAPER, reason: "x" })).ok
    ).toBe(false)
    expect(mockLock).not.toHaveBeenCalled()
    expect(mockUnlock).not.toHaveBeenCalled()
  })

  it("lets an admin lock and unlock with a reason", async () => {
    ctx.role = "admin"
    expect((await lockExamSubject({ examSubjectId: PAPER })).ok).toBe(true)
    expect(
      (
        await unlockExamSubject({
          examSubjectId: PAPER,
          reason: " Wrong mark ",
        })
      ).ok
    ).toBe(true)
    expect(mockUnlock).toHaveBeenCalledWith(ctx, {}, PAPER, "Wrong mark")
  })

  it("refuses an unlock without a reason before the database", async () => {
    ctx.role = "admin"
    const result = await unlockExamSubject({
      examSubjectId: PAPER,
      reason: " ",
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockUnlock).not.toHaveBeenCalled()
  })

  it("refuses a read-only school (D-300)", async () => {
    ctx.role = "owner"
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await lockExamSubject({ examSubjectId: PAPER })
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockLock).not.toHaveBeenCalled()
  })
})

describe("reopenMarksEntry (D-307 review)", () => {
  it("sets the close date to 7 days from today for an admin", async () => {
    ctx.role = "admin"
    expect((await reopenMarksEntry({ examSubjectId: PAPER })).ok).toBe(true)
    const closesOn = mockReopen.mock.calls[0]?.[3] as string
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
    }).format(new Date())
    expect((Date.parse(closesOn) - Date.parse(today)) / 86_400_000).toBe(7)
  })

  it("refuses a teacher", async () => {
    expect((await reopenMarksEntry({ examSubjectId: PAPER })).ok).toBe(false)
    expect(mockReopen).not.toHaveBeenCalled()
  })
})
