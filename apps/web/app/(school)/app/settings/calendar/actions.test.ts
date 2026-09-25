// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-11 Part 1: parse -> context -> can("calendar.holiday.write") ->
 * requireWritable -> repository. A teacher or a read-only workspace never
 * reaches the insert/delete.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = {
  workspaceId: "w",
  userId: "u",
  role: "admin",
  workspaceType: "school",
  plan: "pro",
}
const mockRequireWorkspace = vi.fn(async () => ctx)
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: () => mockRequireWorkspace(),
}))

const mockRequireWritable = vi.fn()
const mockCreate = vi.fn()
const mockDelete = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...args: unknown[]) => mockRequireWritable(...args),
  createHoliday: (...args: unknown[]) => mockCreate(...args),
  deleteHoliday: (...args: unknown[]) => mockDelete(...args),
}))

const { createHoliday, deleteHoliday } = await import("./actions")

const VALID = {
  name: "Victory Day",
  kind: "national",
  startsOn: "2026-12-16",
  endsOn: "2026-12-16",
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockCreate.mockResolvedValue({ ok: true, data: { id: "h" } })
  mockDelete.mockResolvedValue({ ok: true, data: { deleted: true } })
})

describe("createHoliday", () => {
  it("refuses a teacher before any database call", async () => {
    ctx.role = "teacher"
    const result = await createHoliday(VALID)
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("refuses a read-only workspace", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await createHoliday(VALID)
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("rejects a reversed range before resolving the workspace", async () => {
    const result = await createHoliday({ ...VALID, endsOn: "2026-12-15" })
    expect(!result.ok && result.error.fieldErrors?.["endsOn"]).toBeTruthy()
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("creates for an admin", async () => {
    const result = await createHoliday(VALID)
    expect(result.ok).toBe(true)
    expect(mockCreate).toHaveBeenCalledOnce()
  })
})

describe("deleteHoliday", () => {
  it("refuses a teacher", async () => {
    ctx.role = "teacher"
    const result = await deleteHoliday({
      holidayId: "11111111-1111-4111-8111-111111111111",
    })
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("rejects a non-uuid id", async () => {
    const result = await deleteHoliday({ holidayId: "x" })
    expect(!result.ok && result.error.code).toBe("validation_failed")
  })

  it("deletes for an owner", async () => {
    ctx.role = "owner"
    const result = await deleteHoliday({
      holidayId: "11111111-1111-4111-8111-111111111111",
    })
    expect(result.ok).toBe(true)
  })
})
