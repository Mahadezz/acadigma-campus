// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/** F-AC-06 Part 1: parse -> context -> policy -> requireWritable -> coverage -> repo. */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({ requireWorkspace: mockRequireWorkspace }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const mockRequireWritable = vi.fn()
vi.mock("@acadigma/db", () => ({ requireWritable: mockRequireWritable }))

const mockSave = vi.fn()
const mockSeed = vi.fn()
vi.mock("@acadigma/db/repositories/grading", () => ({
  saveGradeScale: mockSave,
  seedBdGradeScale: mockSeed,
}))

const { saveGradeScale, seedBdGradeScale } = await import("./actions")

const CTX = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: "pro",
}
const SCALE_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"
const band = (letter: string, minPercent: number, maxPercent: number) => ({
  letter,
  minPercent,
  maxPercent,
  gradePoint: 1,
  isFail: false,
  sortOrder: 1,
})
const VALID = {
  scaleId: SCALE_ID,
  name: "Pass / fail",
  bands: [band("P", 40, 100), band("F", 0, 39.99)],
}

describe("grading actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWorkspace.mockResolvedValue(CTX)
    mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
    mockSave.mockResolvedValue({ ok: true, data: { scaleId: SCALE_ID } })
    mockSeed.mockResolvedValue({ ok: true, data: { scaleId: SCALE_ID } })
  })

  it("saves a valid scale", async () => {
    expect(await saveGradeScale(VALID)).toEqual({
      ok: true,
      data: { scaleId: SCALE_ID },
    })
    expect(mockSave).toHaveBeenCalledOnce()
  })

  it("refuses a gap before calling the database", async () => {
    const result = await saveGradeScale({
      ...VALID,
      bands: [band("P", 40, 100), band("F", 0, 38.99)],
    })
    expect(!result.ok && result.error.fieldErrors?.["bands"]).toEqual([
      "BAND_GAP",
    ])
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("refuses a teacher (forbidden) without checking read-only", async () => {
    mockRequireWorkspace.mockResolvedValue({ ...CTX, role: "teacher" })
    const result = await seedBdGradeScale()
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockSeed).not.toHaveBeenCalled()
  })

  it("refuses in read-only mode (D-300)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: "Your Pro trial has ended." },
    })
    const result = await saveGradeScale(VALID)
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("rejects invalid input before resolving context", async () => {
    const result = await saveGradeScale({ ...VALID, bands: [] })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })
})
