// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as AcadigmaDomainAuth from "@acadigma/domain/auth"

/**
 * Security review N9: `resetPassword` used to run `verifyOtp` (which both
 * consumes the single-use recovery token AND mints a live session) before the
 * password policy was fully checked. A trivially-bad password would still
 * burn the token and leave a session live. This suite asserts the fixed
 * ordering: the throttle check and a generic (identity-free) password-policy
 * check both run BEFORE `verifyOtp`, and a failure that can only be detected
 * AFTER the exchange (the identity-similarity rule, which needs the user's
 * email/name) signs the freshly-minted session back out.
 *
 * `mockCallOrder` records, in order, every mocked call resetPassword makes,
 * so "did X run before Y" is a plain array assertion rather than inference
 * from return values.
 */
const mockCallOrder: string[] = []

/** Tracks every `cookies().delete(...)` call, name included — the fix under
 * test for both `signInWithPassword` and `resetPassword` (F-ID-03 review:
 * a stale `acadigma_workspace` cookie from a previous session on a shared
 * device must not survive into a newly-minted one), and for `signOut` /
 * `signInWithPassword` again (shared-device review fix below: the two
 * display-preference cookies get the same treatment). */
const mockCookieDelete = vi.fn()
/** Tracks every `cookies().set(...)` call — the shared-device review fix's
 * other half: `signInWithPassword` must write `acadigma_ui_mode` /
 * `acadigma_text_size` from the signing-in user's own stored row so a stale
 * cookie left by whoever used this device before does not outrank it. */
const mockCookieSet = vi.fn()

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    getAll: () => [],
    get: () => undefined,
    set: mockCookieSet,
    delete: mockCookieDelete,
  })),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    mockCallOrder.push(`redirect:${path}`)
    throw new Error("NEXT_REDIRECT")
  }),
}))

const mockVerifyOtp = vi.fn()
const mockUpdateUser = vi.fn()
const mockSignOut = vi.fn()
const mockRpc = vi.fn()
const mockSignInWithPassword = vi.fn()
const mockMaybeSingleProfile = vi.fn()
const mockGetUser = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      verifyOtp: mockVerifyOtp,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
      signInWithPassword: mockSignInWithPassword,
      getUser: mockGetUser,
    },
    rpc: mockRpc,
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: mockMaybeSingleProfile,
            }),
          }),
        }
      }
      throw new Error(`fake supabase client: unexpected table "${table}"`)
    },
  })),
}))

const mockLogAuthEvent = vi.fn()

vi.mock("@/lib/audit", () => ({
  logAuthEvent: mockLogAuthEvent,
}))

/** Shared-device review fix: `signInWithPassword` reads the signing-in
 * user's own stored `user_preferences` row to overwrite a possibly-stale
 * cookie pair. */
const mockFetchUiPreferences = vi.fn()

vi.mock("@acadigma/db/repositories/ui-preferences", () => ({
  fetchUiPreferences: mockFetchUiPreferences,
}))

const mockThrottleStatus = vi.fn()
const mockThrottleRecordFailure = vi.fn()
const mockThrottleReset = vi.fn()

vi.mock("@/lib/throttle", () => ({
  throttleStatus: mockThrottleStatus,
  throttleRecordFailure: mockThrottleRecordFailure,
  throttleReset: mockThrottleReset,
}))

const mockResolveLandingRoute = vi.fn()

vi.mock("@/lib/resolve-landing-route", () => ({
  resolveLandingRoute: mockResolveLandingRoute,
}))

vi.mock("@acadigma/domain/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof AcadigmaDomainAuth>()
  return {
    ...actual,
    checkPassword: vi.fn(
      (input: Parameters<typeof actual.checkPassword>[0]) => {
        mockCallOrder.push("checkPassword")
        return actual.checkPassword(input)
      }
    ),
  }
})

const { resetPassword, signInWithPassword, signOut } = await import("./actions")

const FAKE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "person@test.local",
  user_metadata: { full_name: "Ann Example" },
}

beforeEach(() => {
  mockCallOrder.length = 0
  vi.clearAllMocks()

  mockThrottleStatus.mockImplementation(async () => {
    mockCallOrder.push("throttleStatus")
    return { blocked: false, retryAfterSeconds: 0 }
  })
  mockThrottleRecordFailure.mockImplementation(async () => {
    mockCallOrder.push("throttleRecordFailure")
    return { blocked: false, retryAfterSeconds: 0 }
  })
  mockThrottleReset.mockImplementation(async () => {
    mockCallOrder.push("throttleReset")
  })
  mockVerifyOtp.mockImplementation(async () => {
    mockCallOrder.push("verifyOtp")
    return { data: { user: FAKE_USER }, error: null }
  })
  mockUpdateUser.mockImplementation(async () => {
    mockCallOrder.push("updateUser")
    return { error: null }
  })
  mockSignOut.mockImplementation(async (opts?: { scope?: string }) => {
    mockCallOrder.push(`signOut:${opts?.scope ?? "global"}`)
    return { error: null }
  })
  mockRpc.mockImplementation(async () => ({ data: null, error: null }))
  mockCookieDelete.mockImplementation((name: string) => {
    mockCallOrder.push(`cookieDelete:${name}`)
  })
  mockSignInWithPassword.mockImplementation(async () => {
    mockCallOrder.push("signInWithPassword")
    return { data: { user: FAKE_USER }, error: null }
  })
  mockMaybeSingleProfile.mockImplementation(async () => {
    mockCallOrder.push("profiles.maybeSingle")
    return { data: { suspended_at: null }, error: null }
  })
  mockResolveLandingRoute.mockImplementation(async () => {
    mockCallOrder.push("resolveLandingRoute")
    return "/app"
  })
  mockCookieSet.mockImplementation((name: string, value: string) => {
    mockCallOrder.push(`cookieSet:${name}=${value}`)
  })
  mockGetUser.mockImplementation(async () => {
    mockCallOrder.push("getUser")
    return { data: { user: FAKE_USER } }
  })
  mockLogAuthEvent.mockImplementation(async () => {
    mockCallOrder.push("logAuthEvent")
  })
  mockFetchUiPreferences.mockImplementation(async () => {
    mockCallOrder.push("fetchUiPreferences")
    return { ok: true, data: { uiMode: "basic", textSize: "xlarge" } }
  })
})

describe("resetPassword ordering (security review N9)", () => {
  it("rejects a policy-failing password before exchanging the recovery token", async () => {
    const result = await resetPassword({
      tokenHash: "tok-1",
      password: "Ab1!", // 4 chars -- fails the length floor
    })

    expect(mockCallOrder).toEqual(["throttleStatus", "checkPassword"])
    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(mockUpdateUser).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("validation_failed")
    }
  })

  it("checks throttle and policy before verifyOtp, then completes on a good password", async () => {
    const result = await resetPassword({
      tokenHash: "tok-2",
      password: "Xk9$mQ2pLr7z", // strong, unrelated to FAKE_USER's identity
    })

    expect(mockCallOrder[0]).toBe("throttleStatus")
    expect(mockCallOrder[1]).toBe("checkPassword")
    expect(mockCallOrder.indexOf("checkPassword")).toBeLessThan(
      mockCallOrder.indexOf("verifyOtp")
    )
    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it("signs the freshly-minted session back out when the post-exchange identity check fails", async () => {
    mockVerifyOtp.mockImplementation(async () => {
      mockCallOrder.push("verifyOtp")
      return {
        data: {
          user: {
            id: "22222222-2222-2222-2222-222222222222",
            email: "victim@test.local",
            user_metadata: { full_name: "Victim Person" },
          },
        },
        error: null,
      }
    })

    const result = await resetPassword({
      tokenHash: "tok-3",
      // Passes the generic (identity-free) pre-exchange check, but contains
      // this user's email local part -- fails only once verifyOtp reveals it.
      password: "MyVictimPass9$",
    })

    expect(mockCallOrder).toEqual([
      "throttleStatus",
      "checkPassword",
      "verifyOtp",
      "cookieDelete:acadigma_workspace",
      "checkPassword",
      "signOut:local",
    ])
    expect(mockUpdateUser).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("validation_failed")
    }
  })

  it("clears the acadigma_workspace cookie as soon as verifyOtp mints a session, even before the password is accepted", async () => {
    const result = await resetPassword({
      tokenHash: "tok-4",
      password: "Xk9$mQ2pLr7z",
    })

    expect(result.ok).toBe(true)
    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_workspace")
    expect(mockCallOrder.indexOf("verifyOtp")).toBeLessThan(
      mockCallOrder.indexOf("cookieDelete:acadigma_workspace")
    )
  })
})

describe("signInWithPassword (F-ID-03 review: stale workspace cookie on a shared device)", () => {
  it("clears the acadigma_workspace cookie on a successful sign-in, before resolving the landing route", async () => {
    await expect(
      signInWithPassword({
        email: "person@test.local",
        password: "whatever-they-typed",
        remember: true,
      })
    ).rejects.toThrow("NEXT_REDIRECT")

    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_workspace")
    expect(
      mockCallOrder.indexOf("cookieDelete:acadigma_workspace")
    ).toBeLessThan(mockCallOrder.indexOf("resolveLandingRoute"))
    expect(mockResolveLandingRoute).toHaveBeenCalledTimes(1)
  })

  it("does not clear the cookie when the credentials are rejected", async () => {
    mockSignInWithPassword.mockImplementation(async () => {
      mockCallOrder.push("signInWithPassword")
      return { data: { user: null }, error: { status: 400, code: "invalid" } }
    })

    const result = await signInWithPassword({
      email: "person@test.local",
      password: "wrong-password",
      remember: true,
    })

    expect(result.ok).toBe(false)
    expect(mockCookieDelete).not.toHaveBeenCalled()
  })

  it("still clears the cookie even when the account turns out to be suspended", async () => {
    mockMaybeSingleProfile.mockImplementation(async () => {
      mockCallOrder.push("profiles.maybeSingle")
      return { data: { suspended_at: "2026-01-01T00:00:00Z" }, error: null }
    })

    const result = await signInWithPassword({
      email: "person@test.local",
      password: "whatever-they-typed",
      remember: true,
    })

    expect(result.ok).toBe(false)
    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_workspace")
  })

  it("writes acadigma_ui_mode/acadigma_text_size from the signed-in user's own stored row (shared-device review fix)", async () => {
    mockFetchUiPreferences.mockImplementation(async () => {
      mockCallOrder.push("fetchUiPreferences")
      return { ok: true, data: { uiMode: "basic", textSize: "large" } }
    })

    await expect(
      signInWithPassword({
        email: "person@test.local",
        password: "whatever-they-typed",
        remember: true,
      })
    ).rejects.toThrow("NEXT_REDIRECT")

    expect(mockFetchUiPreferences).toHaveBeenCalledWith(
      expect.anything(),
      FAKE_USER.id
    )
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acadigma_ui_mode",
      "basic",
      expect.objectContaining({ path: "/" })
    )
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acadigma_text_size",
      "large",
      expect.objectContaining({ path: "/" })
    )
    // Overwrites, not merely fills a gap -- a stale cookie from the PREVIOUS
    // person's session must lose, not win, so the write must not be
    // conditional on the old cookie being absent/invalid.
    expect(
      mockCallOrder.indexOf("cookieDelete:acadigma_workspace")
    ).toBeLessThan(mockCallOrder.indexOf("cookieSet:acadigma_ui_mode=basic"))
  })

  it("does not fail sign-in when the preferences row cannot be read", async () => {
    mockFetchUiPreferences.mockImplementation(async () => {
      mockCallOrder.push("fetchUiPreferences")
      return {
        ok: false,
        error: { code: "dependency_unavailable", message: "down" },
      }
    })

    await expect(
      signInWithPassword({
        email: "person@test.local",
        password: "whatever-they-typed",
        remember: true,
      })
    ).rejects.toThrow("NEXT_REDIRECT")

    expect(mockCookieSet).not.toHaveBeenCalled()
  })
})

describe("signOut (review fix: shared-device display-preference leak)", () => {
  it("deletes the workspace cookie and both display-preference cookies", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT")

    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_workspace")
    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_ui_mode")
    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_text_size")
  })
})
