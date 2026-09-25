// @vitest-environment node
import type * as ReactModule from "react"

import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-02 §4.3 / §5 (demo cut): `getLocale`/`getMessages` are what decide
 * whether the whole signed-in app renders in English or বাংলা, not just the
 * auth screens (`apps/web/app/layout.tsx`'s `<html lang>`, every shell's
 * `getMessages()` call). This suite mocks `next/headers` the same way
 * `lib/workspace.test.ts` does, so the cookie-read precedence is exercised
 * without a real request, plus `@/lib/supabase/server` for the D-401
 * `profiles.locale` fallback (the one app-wide resolver, also used by the
 * audit viewer's `getReaderLanguage`).
 *
 * Review follow-up on PR #51: `getLocale` is now wrapped in React's `cache()`
 * so up to five call sites in one request share a single lookup. React's real
 * `cache()` only memoises inside an actual Server Component render (it is a
 * no-op outside one — verified directly: calling a `cache()`-wrapped function
 * twice from plain Node invokes it twice), so this suite mocks `"react"`'s
 * `cache` with a small Map-based stand-in that behaves the same way a real
 * request would, reset every test in `beforeEach` so tests stay independent.
 */
const mockCacheStore = new Map<unknown, unknown>()
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>()
  return {
    ...actual,
    cache:
      <T extends (...args: never[]) => unknown>(fn: T) =>
      (...args: Parameters<T>) => {
        if (!mockCacheStore.has(fn)) mockCacheStore.set(fn, fn(...args))
        return mockCacheStore.get(fn)
      },
  }
})

const mockCookieStore = { get: vi.fn() }
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}))

const mockGetUser = vi.fn()
const mockMaybeSingle = vi.fn()
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: mockMaybeSingle,
    })),
  })),
}))
const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const { getLocale, getMessages, LOCALE_COOKIE } = await import("./i18n")

beforeEach(() => {
  vi.clearAllMocks()
  mockCacheStore.clear()
  mockGetUser.mockResolvedValue({ data: { user: null } })
  mockMaybeSingle.mockResolvedValue({ data: null })
})

describe("getLocale", () => {
  it("reads the acadigma_locale cookie without touching Supabase", async () => {
    mockCookieStore.get.mockReturnValue({ value: "bn" })
    expect(await getLocale()).toBe("bn")
    expect(mockCookieStore.get).toHaveBeenCalledWith(LOCALE_COOKIE)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it("falls back to en when the cookie is missing and nobody is signed in", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    expect(await getLocale()).toBe("en")
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("falls back to the signed-in user's profiles.locale when there is no cookie", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockMaybeSingle.mockResolvedValue({ data: { locale: "bn" } })
    expect(await getLocale()).toBe("bn")
  })

  it("falls back to en when profiles.locale is not a known locale", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockMaybeSingle.mockResolvedValue({ data: { locale: "fr" } })
    expect(await getLocale()).toBe("en")
  })

  it("falls back to en on a cookie value that isn't a known locale, then the profile lookup", async () => {
    // A tampered or stale cookie (e.g. a third language later removed) must
    // never crash the resolver — it falls through to the next tier exactly
    // like a missing cookie.
    mockCookieStore.get.mockReturnValue({ value: "fr" })
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockMaybeSingle.mockResolvedValue({ data: { locale: "bn" } })
    expect(await getLocale()).toBe("bn")
  })

  it("falls back to en if Supabase errors instead of throwing", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    mockGetUser.mockRejectedValue(new Error("network"))
    expect(await getLocale()).toBe("en")
  })

  it("is memoised per request: two calls hit the profile loader once", async () => {
    // Root layout, GatedShell, the (personal)/(family) layouts, SchoolLayout
    // and the audit reader's getReaderLanguage can all call getLocale() in
    // one request. Without cache(), each one is its own auth.getUser() +
    // profiles query.
    mockCookieStore.get.mockReturnValue(undefined)
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    mockMaybeSingle.mockResolvedValue({ data: { locale: "bn" } })

    const [first, second] = await Promise.all([getLocale(), getLocale()])

    expect(first).toBe("bn")
    expect(second).toBe("bn")
    expect(mockGetUser).toHaveBeenCalledTimes(1)
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1)
  })
})

describe("getMessages", () => {
  it("pairs the resolved locale with that locale's catalogue", async () => {
    mockCookieStore.get.mockReturnValue({ value: "bn" })
    const { locale, t } = await getMessages()
    expect(locale).toBe("bn")
    expect(t.common.appName).toBe("Acadigma Campus")
    expect(t.auth.login.title).toBe("সাইন ইন করুন")
  })

  it("defaults to the English catalogue", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const { locale, t } = await getMessages()
    expect(locale).toBe("en")
    expect(t.auth.login.title).toBe("Sign in")
  })
})
