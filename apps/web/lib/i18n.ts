import "server-only"

import { cookies } from "next/headers"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locale"

/**
 * En/bn strings for Server Components (ARCHITECTURE §4: "locale from
 * `user_preferences.language`, cookie-cached, no URL prefix").
 *
 * This is deliberately not the full `next-intl` runtime described in
 * ARCHITECTURE §4 — wiring app-wide locale routing/detection is a cross-cutting
 * change that belongs to whichever Part first needs it everywhere, not to the
 * auth screens alone (logged as a scope note in F-ID-01 §11). What this module
 * gives the auth screens is real: the JSON files are the single source of copy,
 * both languages render, and swapping in `next-intl` later only touches this
 * file and the client components that receive `t` as a prop.
 *
 * `Locale`/`LOCALE_COOKIE`/`isLocale` live in `./locale` (no `server-only` import)
 * so the client-side language toggle can use them without pulling `next/headers`
 * into the browser bundle.
 */
export type { Locale }
export { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale }

const MESSAGES = { en, bn } as const satisfies Record<Locale, unknown>

/** Reads the locale cookie (falls back to `en`). Signed-in users get a real
 * preference from `user_preferences.language`; that wiring lands with the
 * screens that read it (F-ID-05 onboarding, settings). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const raw = store.get(LOCALE_COOKIE)?.value
  return isLocale(raw) ? raw : DEFAULT_LOCALE
}

export type Messages = typeof en

export async function getMessages(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale()
  return { locale, t: MESSAGES[locale] }
}
