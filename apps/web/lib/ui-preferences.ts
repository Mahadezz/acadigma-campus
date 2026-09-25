import "server-only"

import { cache } from "react"

import { cookies } from "next/headers"

import { fetchUiPreferences } from "@acadigma/db/repositories/ui-preferences"
import { resolveUiPrefs } from "@acadigma/domain/ui-preferences"

import { createClient } from "@/lib/supabase/server"

import type { UiPreferences } from "@acadigma/contracts"

/**
 * F-ID-10 §3 cookie mirrors, written server-side by `updateUiPreferences`
 * (`(shared)/workspace/actions.ts`) on every change — same non-httpOnly
 * shape as `acadigma_locale`, so a plain "%3D"-free string is the whole
 * contract.
 */
export const UI_MODE_COOKIE = "acadigma_ui_mode"
export const TEXT_SIZE_COOKIE = "acadigma_text_size"

/**
 * `getUiPreferences` (§7 "server loader"): resolves the pair the current
 * request should render with. Modelled directly on `lib/i18n.ts`'s
 * `getLocale()` — cookie first (works before any query, and is what makes
 * the server render carry the right value on first paint), then the stored
 * row (so a second device, or a browser whose cookie has not caught up,
 * still agrees), then the default; wrapped in React's `cache()` for the
 * same reason `getLocale()` is: the root layout, `/app`'s landing redirect
 * and `/app/settings/display` can all call this once per request without
 * paying for the query more than once.
 */
export const getUiPreferences = cache(async (): Promise<UiPreferences> => {
  const store = await cookies()
  const cookie = {
    uiMode: store.get(UI_MODE_COOKIE)?.value,
    textSize: store.get(TEXT_SIZE_COOKIE)?.value,
  }

  try {
    const client = await createClient()
    const {
      data: { user },
    } = await client.auth.getUser()
    if (!user) return resolveUiPrefs({ cookie, row: null })

    const result = await fetchUiPreferences(client, user.id)
    return resolveUiPrefs({ cookie, row: result.ok ? result.data : null })
  } catch {
    // Signed-out visitor or a Supabase hiccup: same "never error out over a
    // display preference" rule `getLocale()` follows.
    return resolveUiPrefs({ cookie, row: null })
  }
})
