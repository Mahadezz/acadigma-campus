/**
 * The client-safe half of `lib/i18n.ts`: the `Locale` type and the cookie name,
 * with no `"server-only"` / `next/headers` import, so a `"use client"` component
 * (the language toggle) can use it without pulling server code into the bundle.
 */
export type Locale = "en" | "bn"

export const LOCALE_COOKIE = "acadigma_locale"
export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "bn"
}

/**
 * Writes `LOCALE_COOKIE` from the browser (the auth `LanguageToggle` and the
 * signed-in `UserMenu` both call this instead of hand-rolling
 * `document.cookie`). The caller still has to trigger a re-render
 * (`router.refresh()`) — this only sets the cookie `lib/i18n.ts` reads.
 */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

/**
 * The BCP-47 tag `Intl.NumberFormat`/`Intl.DateTimeFormat` should be called
 * with for the active locale. Digits stay Western by default in `bn` too
 * (DESIGN-SYSTEM §1.6, F-ID-02 §5 OQ-2: marks/money/IDs are cross-referenced
 * with government paperwork that uses Western digits) — `-u-nu-latn` pins
 * that independently of the locale's own default numbering system, so a
 * Bengali reader gets Bengali month/weekday names with the same digits an
 * English reader sees. Bengali numerals are opt-in only, on `MoneyText`/
 * `BnEnText`'s own `numerals="bn"` prop for printed report cards.
 */
export function toIntlLocale(locale: Locale): string {
  return locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"
}

/**
 * Reads `LOCALE_COOKIE` from `document.cookie`. For `app/error.tsx` only:
 * Next requires that boundary to be a Client Component, so it cannot call
 * the server-only `getLocale()` in `lib/i18n.ts`; every other page renders
 * on the server and reads the cookie there instead. Falls back to
 * `DEFAULT_LOCALE` before hydration (`document` unavailable) or off-browser.
 */
export function getClientLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`)
  )
  return isLocale(match?.[1]) ? match[1] : DEFAULT_LOCALE
}
