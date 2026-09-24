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
 *
 * F-ID-05 §8 Part 2 addendum (Opus review, PR #24): a successful resolution
 * now also reads `profiles.onboarding_completed_at` and probes
 * `list_my_workspaces` for an active school membership, so every fake
 * Supabase client below stubs `.from("profiles")` and `.rpc(...)` too.
 */
const mockResolveWorkspaceContext = vi.fn()

vi.mock("@acadigma/db", () => ({
  resolveWorkspaceContext: mockResolveWorkspaceContext,
}))

type FakeClientOptions = {
  onboardingCompletedAt?: string | null
  profileError?: boolean
  memberships?: { type: string; status: string }[]
  membershipsError?: boolean
}

function fakeSupabase(options: FakeClientOptions = {}) {
  return {
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.profileError
                ? null
                : {
                    onboarding_completed_at:
                      options.onboardingCompletedAt ?? null,
                  },
              error: options.profileError
                ? { message: "connection reset" }
                : null,
            }),
          }),
        }),
      }
    },
    rpc: async (fn: string) => {
      if (fn !== "list_my_workspaces") throw new Error(`unexpected rpc ${fn}`)
      return {
        data: options.membershipsError ? null : (options.memberships ?? []),
        error: options.membershipsError
          ? { message: "connection reset" }
          : null,
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

let nextFakeClient = fakeSupabase()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => nextFakeClient),
}))

const { resolveLandingRoute } = await import("./resolve-landing-route")

describe("resolveLandingRoute", () => {
  it("always resolves workspace context with an empty header bag, never the request's own headers", async () => {
    nextFakeClient = fakeSupabase({
      onboardingCompletedAt: "2026-01-01T00:00:00Z",
    })
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { userId: "u1", workspaceType: "school", role: "owner" },
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
      data: { userId: "u1", workspaceType: "personal", role: "owner" },
    })
    const override = fakeSupabase({
      onboardingCompletedAt: "2026-01-01T00:00:00Z",
    })

    await resolveLandingRoute(override)

    expect(mockResolveWorkspaceContext).toHaveBeenCalledWith(
      override,
      expect.any(Headers)
    )
  })

  it("sends a resolved school owner to /app", async () => {
    nextFakeClient = fakeSupabase({
      onboardingCompletedAt: "2026-01-01T00:00:00Z",
    })
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { userId: "u1", workspaceType: "school", role: "owner" },
    })
    expect(await resolveLandingRoute()).toBe("/app")
  })

  it("sends a resolved personal workspace to /personal when onboarding is already complete", async () => {
    nextFakeClient = fakeSupabase({
      onboardingCompletedAt: "2026-01-01T00:00:00Z",
    })
    mockResolveWorkspaceContext.mockResolvedValueOnce({
      ok: true,
      data: { userId: "u1", workspaceType: "personal", role: "owner" },
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

  // F-ID-05 §8 Part 2 (Opus review, PR #24): the forced-onboarding wiring.
  describe("the forced-onboarding redirect", () => {
    it("sends a fresh user (never completed, only the auto-created personal workspace) to /onboarding", async () => {
      nextFakeClient = fakeSupabase({
        onboardingCompletedAt: null,
        memberships: [{ type: "personal", status: "active" }],
      })
      mockResolveWorkspaceContext.mockResolvedValueOnce({
        ok: true,
        data: { userId: "u1", workspaceType: "personal", role: "owner" },
      })
      expect(await resolveLandingRoute()).toBe("/onboarding")
    })

    it("sends a user who completed onboarding with only a personal workspace to /personal, unchanged", async () => {
      nextFakeClient = fakeSupabase({
        onboardingCompletedAt: "2026-01-01T00:00:00Z",
        memberships: [{ type: "personal", status: "active" }],
      })
      mockResolveWorkspaceContext.mockResolvedValueOnce({
        ok: true,
        data: { userId: "u1", workspaceType: "personal", role: "owner" },
      })
      expect(await resolveLandingRoute()).toBe("/personal")
    })

    it("sends a user with a school membership to /app regardless of onboarding_completed_at", async () => {
      nextFakeClient = fakeSupabase({
        onboardingCompletedAt: null,
        memberships: [
          { type: "personal", status: "active" },
          { type: "school", status: "active" },
        ],
      })
      mockResolveWorkspaceContext.mockResolvedValueOnce({
        ok: true,
        data: { userId: "u1", workspaceType: "school", role: "owner" },
      })
      expect(await resolveLandingRoute()).toBe("/app")
    })

    it("does not count a removed or pending school membership as active", async () => {
      nextFakeClient = fakeSupabase({
        onboardingCompletedAt: null,
        memberships: [
          { type: "personal", status: "active" },
          { type: "school", status: "removed" },
          { type: "school", status: "pending" },
        ],
      })
      mockResolveWorkspaceContext.mockResolvedValueOnce({
        ok: true,
        data: { userId: "u1", workspaceType: "personal", role: "owner" },
      })
      expect(await resolveLandingRoute()).toBe("/onboarding")
    })

    it("fails closed (does not force onboarding) when the profile fetch and membership probe both error but a school workspace already resolved", async () => {
      nextFakeClient = fakeSupabase({
        profileError: true,
        membershipsError: true,
      })
      mockResolveWorkspaceContext.mockResolvedValueOnce({
        ok: true,
        data: { userId: "u1", workspaceType: "school", role: "owner" },
      })
      // onboardingCompletedAt resolves to null (profile fetch failed), and
      // the RPC probe alone would resolve to false (it also failed) — but
      // resolveWorkspaceContext already resolved workspaceType='school',
      // which alone proves an active school membership exists, so
      // hasActiveSchoolMembership is OR'd true regardless of the failed
      // probe. The override never fires; the ordinary F-ID-03 table applies.
      expect(await resolveLandingRoute()).toBe("/app")
    })
  })
})
