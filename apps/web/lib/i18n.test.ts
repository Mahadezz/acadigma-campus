// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-02 §4.3 / §5 (demo cut): `getLocale`/`getMessages` are what decide
 * whether the whole signed-in app renders in English or বাংলা, not just the
 * auth screens (`apps/web/app/layout.tsx`'s `<html lang>`, every shell's
 * `getMessages()` call). This suite mocks `next/headers` the same way
 * `lib/workspace.test.ts` does, so the cookie-read precedence is exercised
 * without a real request.
 */
const mockCookieStore = { get: vi.fn() }
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}))

const { getLocale, getMessages, LOCALE_COOKIE } = await import("./i18n")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getLocale", () => {
  it("reads the acadigma_locale cookie", async () => {
    mockCookieStore.get.mockReturnValue({ value: "bn" })
    expect(await getLocale()).toBe("bn")
    expect(mockCookieStore.get).toHaveBeenCalledWith(LOCALE_COOKIE)
  })

  it("falls back to en when the cookie is missing", async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    expect(await getLocale()).toBe("en")
  })

  it("falls back to en on a value that isn't a known locale", async () => {
    // A tampered or stale cookie (e.g. a third language later removed)
    // must never crash the resolver — F-ID-02 §5 "Language resolution order"
    // ends at `en`, the same as a missing cookie.
    mockCookieStore.get.mockReturnValue({ value: "fr" })
    expect(await getLocale()).toBe("en")
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
