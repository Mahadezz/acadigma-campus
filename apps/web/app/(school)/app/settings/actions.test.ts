// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * D-300: `updateSchoolSettings` calls `requireWritable` after the policy check
 * and before the write. A read_only workspace gets `payment_required` with the
 * read-only message and the repository is never reached.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({ requireWorkspace: mockRequireWorkspace }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const mockRequireWritable = vi.fn()
vi.mock("@acadigma/db/repositories", () => ({
  requireWritable: mockRequireWritable,
}))

const mockUpdateRepo = vi.fn()
vi.mock("@acadigma/db/repositories/settings", () => ({
  getSchoolSettings: vi.fn(),
  updateSchoolSettings: mockUpdateRepo,
}))

const { updateSchoolSettings } = await import("./actions")

const CTX = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: "pro",
}

describe("updateSchoolSettings — read-only mode (D-300)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns payment_required with the reason and never writes when read_only", async () => {
    mockRequireWorkspace.mockResolvedValue(CTX)
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: "Your Pro trial has ended." },
    })

    const result = await updateSchoolSettings({ timezone: "Asia/Dhaka" })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("payment_required")
      expect(result.error.message).toContain("Your Pro trial has ended.")
    }
    expect(mockUpdateRepo).not.toHaveBeenCalled()
  })

  it("writes when the workspace is writable", async () => {
    mockRequireWorkspace.mockResolvedValue(CTX)
    mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
    mockUpdateRepo.mockResolvedValue({ ok: true, data: {} })

    const result = await updateSchoolSettings({ timezone: "Asia/Dhaka" })

    expect(result.ok).toBe(true)
    expect(mockUpdateRepo).toHaveBeenCalledOnce()
  })

  it("checks the role first: a teacher gets forbidden, not a read-only message", async () => {
    mockRequireWorkspace.mockResolvedValue({ ...CTX, role: "teacher" })

    const result = await updateSchoolSettings({ timezone: "Asia/Dhaka" })

    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
  })
})
