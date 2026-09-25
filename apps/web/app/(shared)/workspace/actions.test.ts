// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * D-401: `updateLocale` is the write side of the one app-wide locale
 * resolver (`getLocale()`, `lib/i18n.ts`) — persists the `UserMenu`'s
 * language switch to `profiles.locale` so it follows the user to their next
 * device, alongside the cookie the client already wrote for this one.
 */
const mockGetUser = vi.fn()
const mockEq = vi.fn()
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ update: mockUpdate }))
const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))
vi.mock("@/lib/logger", () => ({
  requestLogger: vi.fn(async () => ({ warn: vi.fn() })),
}))

const { updateLocale } = await import("./actions")

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
  mockEq.mockResolvedValue({ error: null })
})

describe("updateLocale", () => {
  it("rejects a value that isn't a known locale before touching Supabase", async () => {
    const result = await updateLocale("fr")
    expect(result.ok).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("refuses when nobody is signed in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await updateLocale("bn")
    expect(result.ok).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("updates the caller's own profiles.locale row", async () => {
    const result = await updateLocale("bn")
    expect(result).toEqual({ ok: true, data: { locale: "bn" } })
    expect(mockFrom).toHaveBeenCalledWith("profiles")
    expect(mockUpdate).toHaveBeenCalledWith({ locale: "bn" })
    expect(mockEq).toHaveBeenCalledWith("id", "u1")
  })

  it("returns an error result, not a throw, when the write fails", async () => {
    mockEq.mockResolvedValue({ error: { code: "500", message: "boom" } })
    const result = await updateLocale("en")
    expect(result.ok).toBe(false)
  })
})
