// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@acadigma/contracts"
import type { WorkspaceContext } from "@acadigma/db"

/**
 * F-ID-03 §8 Part 4 review (PR #30): `requireShell(shell)` is
 * `requireWorkspace()` + `resolveShellGate()` in one call — every shell page
 * and layout must call it instead of `requireWorkspace()` directly, because a
 * layout does not always re-run on client-side navigation. This suite mocks
 * `resolveWorkspaceContext` (rather than `requireWorkspace` itself, which
 * lives in the same module under test) so `requireWorkspace()`'s own
 * resolution runs for real, and only the gate decision that follows it is
 * exercised.
 */
const mockResolveWorkspaceContext = vi.fn()
vi.mock("@acadigma/db", () => ({
  WORKSPACE_HEADER: "x-workspace-id",
  resolveWorkspaceContext: mockResolveWorkspaceContext,
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})
const mockForbidden = vi.fn(() => {
  throw new Error("FORBIDDEN")
})
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  forbidden: mockForbidden,
}))

vi.mock("@/lib/logger", () => ({
  requestLogger: vi.fn(async () => ({ warn: vi.fn() })),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const { requireShell } = await import("./workspace")

function context(over: Partial<WorkspaceContext>): WorkspaceContext {
  return {
    workspaceId: "ws-1",
    userId: "user-1",
    role: "owner",
    workspaceType: "school",
    plan: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("requireShell", () => {
  it("returns the context unchanged when it already belongs to the shell", async () => {
    const ctx = context({ workspaceType: "school", role: "owner" })
    mockResolveWorkspaceContext.mockResolvedValue(ok(ctx))

    await expect(requireShell("school")).resolves.toEqual(ctx)
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockForbidden).not.toHaveBeenCalled()
  })

  it("redirects a parent away from the school shell to /family", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(
      ok(context({ workspaceType: "school", role: "parent" }))
    )

    await expect(requireShell("school")).rejects.toThrow("REDIRECT:/family")
  })

  it("redirects a personal workspace away from the school shell to /personal", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(
      ok(context({ workspaceType: "personal", role: "owner" }))
    )

    await expect(requireShell("school")).rejects.toThrow("REDIRECT:/personal")
  })

  it("allows a parent into the family shell", async () => {
    const ctx = context({ workspaceType: "school", role: "parent" })
    mockResolveWorkspaceContext.mockResolvedValue(ok(ctx))

    await expect(requireShell("family")).resolves.toEqual(ctx)
  })

  it("redirects a non-parent staff role away from the family shell to /app", async () => {
    mockResolveWorkspaceContext.mockResolvedValue(
      ok(context({ workspaceType: "school", role: "teacher" }))
    )

    await expect(requireShell("family")).rejects.toThrow("REDIRECT:/app")
  })

  it("allows any role into the personal shell when the workspace is personal", async () => {
    const ctx = context({ workspaceType: "personal", role: "owner" })
    mockResolveWorkspaceContext.mockResolvedValue(ok(ctx))

    await expect(requireShell("personal")).resolves.toEqual(ctx)
  })

  it("propagates requireWorkspace()'s own redirect to /login when signed out", async () => {
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      error: { code: "unauthenticated", message: "signed out" },
    })

    await expect(requireShell("school")).rejects.toThrow("REDIRECT:/login")
    expect(mockForbidden).not.toHaveBeenCalled()
  })

  it("propagates requireWorkspace()'s own forbidden() when there is no membership at all", async () => {
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      error: { code: "forbidden", message: "not a member of any workspace" },
    })

    await expect(requireShell("school")).rejects.toThrow("FORBIDDEN")
  })
})
