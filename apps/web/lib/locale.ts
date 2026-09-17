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
