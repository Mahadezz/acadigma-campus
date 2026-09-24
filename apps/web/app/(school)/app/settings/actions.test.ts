// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-OP-07 Part 1 server actions: the gate order is parse -> context ->
 * permission -> requireWritable -> repository (CLAUDE.md rule 5), so a
 * teacher (AC4) or a read-only workspace never reaches the UPDATE.
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
vi.mock("@acadigma/db", () => ({
  requireWritable: (...args: unknown[]) => mockRequireWritable(...args),
}))

const mockUpdate = vi.fn()
vi.mock("@acadigma/db/repositories/settings", () => ({
  getSchoolSettings: vi.fn(),
  updateSchoolSettings: vi.fn(),
  updateSchoolProfile: (...args: unknown[]) => mockUpdate(...args),
}))

const { updateBranding, updateSchoolProfile } = await import("./actions")

const VERSION = "2026-09-25T10:00:00+00:00"

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockUpdate.mockResolvedValue({ ok: true, data: { version: "v2" } })
})

describe("updateSchoolProfile", () => {
  it("refuses a teacher with forbidden before touching the database (AC4)", async () => {
    ctx.role = "teacher"
    const result = await updateSchoolProfile({
      version: VERSION,
      profile: { legal_name: "X" },
    })
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("refuses a read-only workspace (requireWritable, D-29)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await updateSchoolProfile({
      version: VERSION,
      profile: { legal_name: "X" },
    })
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rejects invalid input before resolving the workspace", async () => {
    const result = await updateSchoolProfile({
      version: VERSION,
      profile: { eiin: "12" },
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("saves for an admin", async () => {
    const result = await updateSchoolProfile({
      version: VERSION,
      profile: { legal_name: "X" },
    })
    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalledOnce()
  })
})

describe("updateBranding", () => {
  it("refuses an unknown header token, naming it", async () => {
    const result = await updateBranding({
      version: VERSION,
      branding: { header_line_1: "{school_name}" },
    })
    expect(
      !result.ok && result.error.fieldErrors?.["header_line_1"]?.[0]
    ).toContain("{school_name}")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("saves known tokens for an owner", async () => {
    ctx.role = "owner"
    const result = await updateBranding({
      version: VERSION,
      branding: { header_line_1: "{address_line1}, {city}" },
    })
    expect(result.ok).toBe(true)
  })
})
