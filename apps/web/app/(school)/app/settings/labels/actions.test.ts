// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-03 Part 6 (D-111): custom-label CRUD actions — parse -> context ->
 * can("labels.write") -> requireWritable -> repository. `custom_labels` RLS
 * is the second wall (02/03/09 pgTAP).
 */

const mockRevalidate = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "admin" }
vi.mock("@/lib/workspace", () => ({ requireWorkspace: async () => ctx }))

const mockRequireWritable = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  createCustomLabel: (...a: unknown[]) => mockCreate(...a),
  updateCustomLabel: (...a: unknown[]) => mockUpdate(...a),
  deleteCustomLabel: (...a: unknown[]) => mockDelete(...a),
}))

const { createCustomLabel, updateCustomLabel, deleteCustomLabel } =
  await import("./actions")

const ID = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"
const GOOD = { name: "Vice-Principal", baseRole: "admin", color: "#3B82F6" }

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockCreate.mockResolvedValue({ ok: true, data: { id: ID, ...GOOD } })
  mockUpdate.mockResolvedValue({ ok: true, data: { id: ID, ...GOOD } })
  mockDelete.mockResolvedValue({ ok: true, data: { id: ID } })
})

describe("createCustomLabel", () => {
  it("rejects a bad colour before anything else", async () => {
    const r = await createCustomLabel({ ...GOOD, color: "blue" })
    expect(!r.ok && r.error.code).toBe("validation_failed")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("rejects the parent base role", async () => {
    const r = await createCustomLabel({ ...GOOD, baseRole: "parent" })
    expect(!r.ok && r.error.code).toBe("validation_failed")
  })

  it.each(["teacher", "staff", "parent"])("refuses a %s", async (role) => {
    ctx.role = role
    const r = await createCustomLabel(GOOD)
    expect(!r.ok && r.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
  })

  it("refuses a read-only school", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const r = await createCustomLabel(GOOD)
    expect(!r.ok && r.error.code).toBe("payment_required")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("passes an admin's request through and revalidates", async () => {
    const r = await createCustomLabel(GOOD)
    expect(r.ok).toBe(true)
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockRevalidate).toHaveBeenCalledWith("/app/settings/labels")
  })
})

describe("updateCustomLabel", () => {
  it("requires an id", async () => {
    const r = await updateCustomLabel(GOOD)
    expect(!r.ok && r.error.code).toBe("validation_failed")
  })

  it("updates for an admin", async () => {
    const r = await updateCustomLabel({ id: ID, ...GOOD })
    expect(r.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalledOnce()
  })
})

describe("deleteCustomLabel", () => {
  it("refuses a teacher", async () => {
    ctx.role = "teacher"
    const r = await deleteCustomLabel({ id: ID })
    expect(!r.ok && r.error.code).toBe("forbidden")
  })

  it("deletes for an admin", async () => {
    const r = await deleteCustomLabel({ id: ID })
    expect(r.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalledOnce()
  })
})
