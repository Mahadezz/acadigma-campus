// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-03 Part 6 (D-111): the role/staff/label actions follow the same
 * parse -> context -> can() -> requireWritable -> repository shape. These
 * pin the gate; the database rules live in `39b_member_staff_fields.sql`.
 */

const mockRevalidate = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidate }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "admin" }
vi.mock("@/lib/workspace", () => ({ requireWorkspace: async () => ctx }))

const mockRequireWritable = vi.fn()
const mockRole = vi.fn()
const mockStaff = vi.fn()
const mockLabel = vi.fn()
const mockDetail = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  changeMemberRole: (...a: unknown[]) => mockRole(...a),
  updateMemberStaffFields: (...a: unknown[]) => mockStaff(...a),
  assignMemberLabel: (...a: unknown[]) => mockLabel(...a),
  getMemberDetail: (...a: unknown[]) => mockDetail(...a),
}))

const {
  changeMemberRole,
  updateMemberStaffFields,
  assignMemberLabel,
  getMemberDetail,
} = await import("./actions")

const MEMBER = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockRole.mockResolvedValue({ ok: true, data: { id: MEMBER, role: "staff" } })
  mockStaff.mockResolvedValue({
    ok: true,
    data: {
      id: MEMBER,
      employeeCode: "TCH-2026-0001",
      department: null,
      phone: null,
    },
  })
  mockLabel.mockResolvedValue({ ok: true, data: { id: MEMBER, labelId: null } })
  mockDetail.mockResolvedValue({
    ok: true,
    data: {
      id: MEMBER,
      role: "teacher",
      status: "active",
      employeeCode: null,
      department: null,
      phone: null,
      labelId: null,
      label: null,
    },
  })
})

describe("changeMemberRole", () => {
  it("rejects an unassignable role before anything else", async () => {
    const r = await changeMemberRole({ memberId: MEMBER, role: "owner" })
    expect(!r.ok && r.error.code).toBe("validation_failed")
    expect(mockRole).not.toHaveBeenCalled()
  })

  it.each(["teacher", "staff", "parent"])("refuses a %s", async (role) => {
    ctx.role = role
    const r = await changeMemberRole({ memberId: MEMBER, role: "teacher" })
    expect(!r.ok && r.error.code).toBe("forbidden")
    expect(mockRequireWritable).not.toHaveBeenCalled()
  })

  it("refuses a read-only school", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: null },
    })
    const r = await changeMemberRole({ memberId: MEMBER, role: "teacher" })
    expect(!r.ok && r.error.code).toBe("payment_required")
    expect(mockRole).not.toHaveBeenCalled()
  })

  it("passes an admin's request through and revalidates", async () => {
    const r = await changeMemberRole({ memberId: MEMBER, role: "staff" })
    expect(r.ok).toBe(true)
    expect(mockRole).toHaveBeenCalledWith(ctx, {}, MEMBER, "staff")
    expect(mockRevalidate).toHaveBeenCalledWith("/app/staff/team")
  })
})

describe("updateMemberStaffFields", () => {
  it("refuses a parent (no staff_fields.write)", async () => {
    ctx.role = "parent"
    const r = await updateMemberStaffFields({ memberId: MEMBER })
    expect(!r.ok && r.error.code).toBe("forbidden")
    expect(mockStaff).not.toHaveBeenCalled()
  })

  it("reaches the repository for an admin", async () => {
    const r = await updateMemberStaffFields({
      memberId: MEMBER,
      department: "Maths",
    })
    expect(r.ok).toBe(true)
    expect(mockStaff).toHaveBeenCalledOnce()
  })
})

describe("assignMemberLabel", () => {
  it.each(["teacher", "staff", "parent"])("refuses a %s", async (role) => {
    ctx.role = role
    const r = await assignMemberLabel({ memberId: MEMBER, labelId: null })
    expect(!r.ok && r.error.code).toBe("forbidden")
  })

  it("clears a label for an admin", async () => {
    const r = await assignMemberLabel({ memberId: MEMBER, labelId: null })
    expect(r.ok).toBe(true)
    expect(mockLabel).toHaveBeenCalledOnce()
  })
})

describe("getMemberDetail", () => {
  it("is a read: no requireWritable, admin allowed", async () => {
    const r = await getMemberDetail({ memberId: MEMBER })
    expect(r.ok).toBe(true)
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockDetail).toHaveBeenCalledOnce()
  })

  it("refuses a teacher (no contact.read)", async () => {
    ctx.role = "teacher"
    const r = await getMemberDetail({ memberId: MEMBER })
    expect(!r.ok && r.error.code).toBe("forbidden")
    expect(mockDetail).not.toHaveBeenCalled()
  })
})
