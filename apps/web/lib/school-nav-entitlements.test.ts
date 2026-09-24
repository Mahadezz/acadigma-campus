// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import type { WorkspaceContext } from "@acadigma/db"

/**
 * PR #17 Opus review: `getWorkspacePlan` embeds `plans(*)`, which RLS
 * (`plans_select_public`) hides for a non-public/inactive plan (e.g.
 * `personal_free`, or a custom enterprise contract) even though the caller
 * can read their own `plan_id` — that reached `resolveEntitledNavModules` as
 * an ordinary "plan lookup failed" and hid Attendance/Students/Timetable/
 * Exams/Messages. `resolveEntitledNavModules` now calls `getWorkspacePlanId`
 * (no embed) instead, so a non-public-plan workspace resolves its real
 * modules correctly rather than falling back at all.
 */
const mockGetWorkspacePlanId = vi.fn()
const mockListEnabledModules = vi.fn()

vi.mock("@acadigma/db", () => ({
  getWorkspacePlanId: mockGetWorkspacePlanId,
  listEnabledModules: mockListEnabledModules,
}))

const { resolveEntitledNavModules } = await import("./school-nav-entitlements")

const CTX = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: null,
} as unknown as WorkspaceContext

const CLIENT = {} as never

describe("resolveEntitledNavModules", () => {
  it("resolves real modules for a workspace on a non-public plan (personal_free-shaped)", async () => {
    // getWorkspacePlanId succeeds even though the plan itself is not public --
    // that is the entire point of using it instead of getWorkspacePlan.
    mockGetWorkspacePlanId.mockResolvedValueOnce({
      ok: true,
      data: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
    })
    mockListEnabledModules.mockResolvedValueOnce({
      ok: true,
      data: ["attendance", "lessons", "resources"],
    })

    const modules = await resolveEntitledNavModules(CTX, CLIENT)

    expect(modules).toContain("attendance")
    expect(modules).toContain("lessons")
    // "hiring" maps to a plan module not in the enabled list above.
    expect(modules).not.toContain("hiring")
  })

  it("fails VISIBLE (core modules), not empty, when the plan id itself cannot be resolved", async () => {
    mockGetWorkspacePlanId.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_found", message: "no plan" },
    })

    const modules = await resolveEntitledNavModules(CTX, CLIENT)

    // Daily-loop screens stay visible.
    expect(modules).toContain("attendance")
    expect(modules).toContain("timetable")
    expect(modules).toContain("messages")
    // Upsell-gated modules stay hidden until a real plan is known.
    expect(modules).not.toContain("hiring")
    expect(modules).not.toContain("cover")
    expect(modules).not.toContain("marketplace")
  })

  it("fails VISIBLE the same way when listEnabledModules itself errors after a valid plan id", async () => {
    mockGetWorkspacePlanId.mockResolvedValueOnce({
      ok: true,
      data: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
    })
    mockListEnabledModules.mockResolvedValueOnce({
      ok: false,
      error: { code: "dependency_unavailable", message: "timeout" },
    })

    const modules = await resolveEntitledNavModules(CTX, CLIENT)

    expect(modules).toContain("attendance")
    expect(modules).not.toContain("hiring")
  })
})
