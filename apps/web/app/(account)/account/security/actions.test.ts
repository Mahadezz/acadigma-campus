// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const calls: string[] = []
const mockCookieDelete = vi.fn()
const mockCookieSet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: mockCookieDelete,
    set: mockCookieSet,
  })),
}))

let user: { id: string; email?: string } | null = { id: "u1", email: "a@b.c" }
let reauthError: { message: string } | null = null
const auth = {
  getUser: vi.fn(async () => ({ data: { user } })),
  signInWithPassword: vi.fn(async () => {
    calls.push("reauth")
    return { error: reauthError }
  }),
  signOut: vi.fn(async (opts: { scope: string }) => {
    calls.push(`signOut:${opts.scope}`)
    return { error: null }
  }),
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth })),
}))

let blocked = false
const mockRecordFailure = vi.fn(async () => undefined)
vi.mock("@/lib/throttle", () => ({
  USER_THROTTLE_KEYS: { changePassword: "user:changePassword" },
  throttleStatus: vi.fn(async () => ({
    blocked,
    retryAfterSeconds: blocked ? 600 : 0,
  })),
  throttleRecordFailure: mockRecordFailure,
}))
vi.mock("@/lib/i18n", () => ({
  getMessages: vi.fn(async () => ({
    locale: "en",
    t: { auth: { login: { throttled: "Try again in {minutes} min." } } },
  })),
}))

let repoResult: unknown = {
  ok: true,
  data: { scheduledPurgeAt: "2026-10-29T18:00:00Z" },
}
vi.mock("@acadigma/db/repositories/account-deletion", () => ({
  requestAccountDeletion: vi.fn(async () => {
    calls.push("rpc")
    return repoResult
  }),
  cancelAccountDeletion: vi.fn(async () => ({
    ok: true,
    data: { cancelled: true },
  })),
}))

const { requestAccountDeletion, cancelAccountDeletion } =
  await import("./actions")

const valid = { confirmation: "DELETE", password: "pw" }

beforeEach(() => {
  calls.length = 0
  user = { id: "u1", email: "a@b.c" }
  reauthError = null
  blocked = false
  repoResult = { ok: true, data: { scheduledPurgeAt: "2026-10-29T18:00:00Z" } }
  mockCookieDelete.mockReset()
  mockRecordFailure.mockReset()
})

describe("requestAccountDeletion", () => {
  it("re-authenticates, schedules, then signs out every session", async () => {
    const result = await requestAccountDeletion(valid)
    expect(result).toEqual({
      ok: true,
      data: { scheduledPurgeAt: "2026-10-29T18:00:00Z" },
    })
    expect(calls).toEqual(["reauth", "rpc", "signOut:global"])
    expect(mockCookieDelete).toHaveBeenCalledWith("acadigma_workspace")
    expect(mockCookieSet).toHaveBeenCalledWith(
      "acadigma_deletion_notice",
      "2026-10-29T18:00:00Z",
      expect.objectContaining({ httpOnly: true })
    )
  })

  it("refuses anything but the exact word DELETE, before touching auth", async () => {
    const result = await requestAccountDeletion({
      ...valid,
      confirmation: "delete",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("validation_failed")
    expect(calls).toEqual([])
  })

  it("a signed-out caller is unauthenticated", async () => {
    user = null
    const result = await requestAccountDeletion(valid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("unauthenticated")
  })

  it("a wrong password counts against the throttle and schedules nothing", async () => {
    reauthError = { message: "Invalid login credentials" }
    const result = await requestAccountDeletion(valid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.fieldErrors?.password).toBeDefined()
    expect(mockRecordFailure).toHaveBeenCalledOnce()
    expect(calls).toEqual(["reauth"])
  })

  it("a throttled caller gets no password check at all", async () => {
    blocked = true
    const result = await requestAccountDeletion(valid)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("rate_limited")
    expect(calls).toEqual([])
  })

  it("SOLE_OWNER_BLOCKED from the database keeps the sessions", async () => {
    repoResult = {
      ok: false,
      error: { code: "forbidden", message: "only owner" },
    }
    const result = await requestAccountDeletion(valid)
    expect(result.ok).toBe(false)
    expect(calls).toEqual(["reauth", "rpc"])
  })
})

describe("cancelAccountDeletion", () => {
  it("cancels for a signed-in caller", async () => {
    expect(await cancelAccountDeletion()).toEqual({
      ok: true,
      data: { cancelled: true },
    })
  })

  it("is unauthenticated without a session", async () => {
    user = null
    const result = await cancelAccountDeletion()
    expect(result.ok).toBe(false)
  })
})
