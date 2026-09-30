// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const calls: string[] = []
const mockCookieDelete = vi.fn()
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: mockCookieDelete })),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let user: { id: string } | null = { id: "u1" }
let signOutError: { message: string } | null = null
const auth = {
  getUser: vi.fn(async () => ({ data: { user } })),
  signOut: vi.fn(async (opts: { scope: string }) => {
    calls.push(`signOut:${opts.scope}`)
    return { error: signOutError }
  }),
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth })),
}))

const mockRevoke = vi.fn(async () => ({ ok: true, data: { revoked: true } }))
let revokeAllResult: unknown = { ok: true, data: { revoked: 2 } }
vi.mock("@acadigma/db/repositories/sessions", () => ({
  revokeMySession: mockRevoke,
  revokeAllMySessions: vi.fn(async () => {
    calls.push("rpc:revoke_all")
    return revokeAllResult
  }),
}))

const { revokeSession, signOutEverywhere } = await import("./session-actions")

const SESSION_ID = "0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"

beforeEach(() => {
  calls.length = 0
  user = { id: "u1" }
  signOutError = null
  revokeAllResult = { ok: true, data: { revoked: 2 } }
  vi.clearAllMocks()
})

describe("revokeSession", () => {
  it("rejects anything but a session id before touching the database", async () => {
    const result = await revokeSession({ sessionId: "everyone" })
    expect(result.ok).toBe(false)
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it("needs a signed-in caller", async () => {
    user = null
    const result = await revokeSession({ sessionId: SESSION_ID })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("unauthenticated")
    expect(mockRevoke).not.toHaveBeenCalled()
  })

  it("revokes through the repository and returns its result", async () => {
    const result = await revokeSession({ sessionId: SESSION_ID })
    expect(mockRevoke).toHaveBeenCalledWith(expect.anything(), SESSION_ID)
    expect(result).toEqual({ ok: true, data: { revoked: true } })
  })
})

describe("signOutEverywhere", () => {
  it("revokes every session in the database, then drops this one locally and clears the cookies", async () => {
    expect(await signOutEverywhere()).toEqual({
      ok: true,
      data: { signedOut: true },
    })
    expect(calls).toEqual(["rpc:revoke_all", "signOut:local"])
    expect(mockCookieDelete).toHaveBeenCalledTimes(3)
  })

  it("reports a failed revoke instead of pretending, and keeps the session", async () => {
    revokeAllResult = {
      ok: false,
      error: { code: "dependency_unavailable", message: "down" },
    }
    const result = await signOutEverywhere()
    expect(result.ok).toBe(false)
    expect(mockCookieDelete).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it("needs a signed-in caller", async () => {
    user = null
    const result = await signOutEverywhere()
    expect(result.ok).toBe(false)
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})
