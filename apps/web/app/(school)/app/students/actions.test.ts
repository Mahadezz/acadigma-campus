// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-02 demo cut (D-103): parse -> context -> can() -> requireWritable
 * -> repository. A teacher or a read-only school never reaches the RPC.
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
const mockAdmit = vi.fn()
const mockInvite = vi.fn()
const mockRevoke = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  admitStudent: (...a: unknown[]) => mockAdmit(...a),
  inviteGuardian: (...a: unknown[]) => mockInvite(...a),
  revokeGuardianLink: (...a: unknown[]) => mockRevoke(...a),
}))

const { quickAdmitStudent, inviteGuardian, revokeGuardianLink } =
  await import("./actions")

const INPUT = {
  idempotencyKey: "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f",
  firstName: "Rahim",
  lastName: "Uddin",
  gender: "male",
  dateOfBirth: "2014-03-09",
  sectionId: "6a1d3b2f-9c8e-4d4b-8f70-2b3c4d5e6f7a",
  guardian: {
    relation: "father",
    fullName: "Karim Uddin",
    phone: "01712345678",
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockAdmit.mockResolvedValue({
    ok: true,
    data: { studentId: "s", studentCode: "STU-2026-00001", rollNumber: 1 },
  })
})

describe("quickAdmitStudent", () => {
  it("admits with the normalised phone", async () => {
    const result = await quickAdmitStudent(INPUT)
    expect(result.ok).toBe(true)
    expect(mockAdmit.mock.calls[0]?.[2].guardian.phone).toBe("+8801712345678")
  })

  it("refuses bad input before resolving the workspace", async () => {
    const result = await quickAdmitStudent({ ...INPUT, gender: "robot" })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockAdmit).not.toHaveBeenCalled()
  })

  it("refuses a teacher before touching the database", async () => {
    ctx.role = "teacher"
    const result = await quickAdmitStudent(INPUT)
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockAdmit).not.toHaveBeenCalled()
  })

  it("refuses a read-only school (D-300)", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const result = await quickAdmitStudent(INPUT)
    expect(!result.ok && result.error.code).toBe("payment_required")
    expect(mockAdmit).not.toHaveBeenCalled()
  })
})

describe("inviteGuardian / revokeGuardianLink (D-108, D-109)", () => {
  const ID = "6a1d3b2f-9c8e-4d4b-8f70-2b3c4d5e6f7a"

  it("invites through the repository for an admin", async () => {
    mockInvite.mockResolvedValue({
      ok: true,
      data: { token: "t", expiresAt: "2026-10-26T00:00:00Z" },
    })
    const result = await inviteGuardian({ guardianId: ID })
    expect(result.ok).toBe(true)
    expect(mockInvite.mock.calls[0]?.[2]).toBe(ID)
  })

  it("lets a teacher reach the database, which decides class teacher (D-109)", async () => {
    ctx.role = "teacher"
    mockRevoke.mockResolvedValue({ ok: true, data: null })
    expect((await revokeGuardianLink({ linkId: ID })).ok).toBe(true)
    expect(mockRevoke).toHaveBeenCalledTimes(1)
  })

  it("refuses staff, bad input and a read-only school", async () => {
    expect((await inviteGuardian({ guardianId: "nope" })).ok).toBe(false)
    ctx.role = "staff"
    const forbidden = await revokeGuardianLink({ linkId: ID })
    expect(!forbidden.ok && forbidden.error.code).toBe("forbidden")
    ctx.role = "owner"
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const readOnly = await inviteGuardian({ guardianId: ID })
    expect(!readOnly.ok && readOnly.error.code).toBe("payment_required")
    expect(mockInvite).not.toHaveBeenCalled()
    expect(mockRevoke).not.toHaveBeenCalled()
  })
})
