// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

/**
 * F-ID-03 review follow-up (shared-phone scenario): `resolveLandingRoute` must
 * never trust the incoming request's `x-workspace-id` header, because
 * middleware has already mirrored a possibly-stale `acadigma_workspace` cookie
 * (left by whoever was last signed in on this device) into it before this
 * function runs. Asserting on the exact `Headers` instance
 * `resolveWorkspaceContext` is called with is the only way to catch a
 * regression back to `headers()` — a mocked `resolveWorkspaceContext` cannot
 * otherwise tell "ignored the header" apart from "the header happened to be
 * empty this time".
 */
const mockResolveWorkspaceContext = vi.fn()

vi.mock("@acadigma/db", () => ({
  resolveWorkspaceContext: mockResolveWorkspaceContext,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ __fakeSupabaseClient: true })),
}))

const { resolveLandingRoute } = await import("./resolve-landing-route")

describe("resolveLandingRoute", () => {
  it("always resolves workspace context with an empty header bag, never the request's own headers", async () => {
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { workspaceType: "school", role: "owner" },
    })

    await resolveLandingRoute()

    expect(mockResolveWorkspaceContext).toHaveBeenCalledTimes(1)
    const headersArg = mockResolveWorkspaceContext.mock.calls[0]?.[1]
    expect(headersArg).toBeInstanceOf(Headers)
    // The regression this guards against: a stale x-workspace-id header from a
    // PREVIOUS person's session on a shared device must never reach
    // resolveWorkspaceContext from here, even if the real request has one.
    expect(headersArg.get("x-workspace-id")).toBeNull()
  })

  it("reuses a supplied client instead of creating a new one", async () => {
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { workspaceType: "personal", role: "owner" },
    })
    const override = { __override: true } as never

    await resolveLandingRoute(override)

    expect(mockResolveWorkspaceContext).toHaveBeenCalledWith(
      override,
      expect.any(Headers)
    )
  })

  it("sends a resolved school owner to /app", async () => {
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { workspaceType: "school", role: "owner" },
    })
    expect(await resolveLandingRoute()).toBe("/app")
  })

  it("sends a resolved personal workspace to /personal", async () => {
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { workspaceType: "personal", role: "owner" },
    })
    expect(await resolveLandingRoute()).toBe("/personal")
  })

  it("falls back to /onboarding on any resolution failure, including a false not_a_member from a stale hint", async () => {
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: false,
      error: { code: "forbidden", reason: "not_a_member", message: "no" },
    })
    expect(await resolveLandingRoute()).toBe("/onboarding")
  })
})
