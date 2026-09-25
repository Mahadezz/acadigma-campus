import "server-only"

import { cookies } from "next/headers"

import { createClient } from "@/lib/supabase/server"
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

/**
 * The one locale resolver for the whole app (D-401): `acadigma_locale` cookie
 * first (fast, works signed out), then the signed-in user's persisted
 * `profiles.locale` (so a language switched on another device is honoured
 * here even before this device's cookie catches up), then `en`.
 *
 * Before this, the audit viewer (`(school)/app/audit/actions.ts`,
 * `getReaderLanguage`) read `profiles.locale` directly and never looked at
 * the cookie, so switching language from the (cookie-only) `UserMenu` left
 * the audit page on whatever `profiles.locale` last was. `getReaderLanguage`
 * now delegates here instead of duplicating the lookup, so there is exactly
 * one place this precedence is decided. `UserMenu`'s switch
 * (`(shared)/workspace/actions.ts`, `updateLocale`) writes `profiles.locale`
 * in addition to the cookie for the same reason, in the other direction.
 *
 * The `profiles.locale` lookup only runs when there is no cookie yet (a
 * fresh session, or a browser that never switched language locally) — every
 * other request pays only the cookie read, not a database round trip.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const raw = store.get(LOCALE_COOKIE)?.value
  if (isLocale(raw)) return raw

  try {
    const client = await createClient()
    const {
      data: { user },
    } = await client.auth.getUser()
    if (!user) return DEFAULT_LOCALE

    const { data } = await client
      .from("profiles")
      .select("locale")
      .eq("id", user.id)
      .maybeSingle()
    return isLocale(data?.locale) ? data.locale : DEFAULT_LOCALE
  } catch {
    // A signed-out visitor or a Supabase hiccup falls back to the default —
    // the same "never error out over a language pick" rule `getReaderLanguage`
    // already followed.
    return DEFAULT_LOCALE
  }
}

export type Messages = typeof en

export async function getMessages(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale()
  return { locale, t: MESSAGES[locale] }
}
