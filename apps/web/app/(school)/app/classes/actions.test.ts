// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NCTB_STARTER_SUBJECTS } from "@acadigma/domain/academic"

/**
 * F-AC-01 demo cut (D-102): parse -> context -> can() -> requireWritable
 * -> repository. A teacher (AC10) or a read-only school never reaches the
 * repository; the starter seed skips what the school already has.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "admin" }
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: async () => ctx,
}))

const mockRequireWritable = vi.fn()
const mockCreateSection = vi.fn()
const mockArchive = vi.fn()
const mockCreateSubjects = vi.fn()
const mockListSubjects = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  createSection: (...a: unknown[]) => mockCreateSection(...a),
  archiveSection: (...a: unknown[]) => mockArchive(...a),
  createSubjects: (...a: unknown[]) => mockCreateSubjects(...a),
  listSubjects: (...a: unknown[]) => mockListSubjects(...a),
}))

const { archiveSection, createSection, createSubject, seedStarterSubjects } =
  await import("./actions")

const GRADE = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockCreateSection.mockResolvedValue({ ok: true, data: { id: "s" } })
  mockArchive.mockResolvedValue({ ok: true, data: { id: "s" } })
  mockCreateSubjects.mockResolvedValue({ ok: true, data: { created: 1 } })
  mockListSubjects.mockResolvedValue({ ok: true, data: [] })
})

describe("createSection", () => {
  it("refuses a teacher before touching the database (AC10)", async () => {
    ctx.role = "teacher"
    const result = await createSection({ gradeLevelId: GRADE, name: "A" })
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockCreateSection).not.toHaveBeenCalled()
  })

  it("refuses a read-only school (D-300)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await createSection({ gradeLevelId: GRADE, name: "A" })
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockCreateSection).not.toHaveBeenCalled()
  })

  it("rejects bad input before resolving anything", async () => {
    const result = await createSection({ gradeLevelId: "nope", name: "A" })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockRequireWritable).not.toHaveBeenCalled()
  })

  it("creates for an admin", async () => {
    const result = await createSection({ gradeLevelId: GRADE, name: "A" })
    expect(result.ok).toBe(true)
    expect(mockCreateSection).toHaveBeenCalledWith({}, ctx, {
      gradeLevelId: GRADE,
      name: "A",
    })
  })
})

describe("archiveSection / createSubject", () => {
  it("staff cannot archive", async () => {
    ctx.role = "staff"
    const result = await archiveSection({ sectionId: GRADE })
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockArchive).not.toHaveBeenCalled()
  })

  it("an owner adds a subject", async () => {
    ctx.role = "owner"
    const result = await createSubject({
      name: "Physics",
      category: "core",
      subjectKind: "compulsory",
    })
    expect(result).toEqual({ ok: true, data: { created: 1 } })
  })
})

describe("seedStarterSubjects", () => {
  it("adds only the starter subjects the school does not already have", async () => {
    mockListSubjects.mockResolvedValue({
      ok: true,
      data: [
        { name: "bangla 1st paper", code: null },
        { name: "Maths (custom)", code: "MATH" },
      ],
    })
    await seedStarterSubjects()
    const inserted = mockCreateSubjects.mock.calls[0]?.[2] as { code: string }[]
    expect(inserted).toHaveLength(NCTB_STARTER_SUBJECTS.length - 2)
    expect(inserted.map((s) => s.code)).not.toContain("BAN1")
    expect(inserted.map((s) => s.code)).not.toContain("MATH")
  })

  it("parents and teachers cannot seed", async () => {
    ctx.role = "teacher"
    const result = await seedStarterSubjects()
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockCreateSubjects).not.toHaveBeenCalled()
  })
})
