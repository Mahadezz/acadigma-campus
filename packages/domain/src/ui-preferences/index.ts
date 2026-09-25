/**
 * F-ID-10 Part 1 (D-403): resolves the display preference a page should
 * render with, the same "cookie first, then the stored row, then a default"
 * precedence `apps/web/lib/i18n.ts`'s `getLocale()` already uses for
 * language — cookie is checked first because it answers without a database
 * round trip and is what makes the server render carry the right value on
 * the very first paint (no flash); the row is what makes a second device,
 * or a browser whose cookie has not caught up yet, agree with the first
 * (F-ID-10 §3 "Cookie mirrors ... give a no-flash first paint and work
 * offline"). Each field resolves independently: a request can have a valid
 * `text_size` cookie and no `ui_mode` cookie yet (e.g. right after `text
 * size` was changed but before `ui_mode` was ever written).
 */

import { textSizeSchema, uiModeSchema } from "@acadigma/contracts"

import type { TextSize, UiMode, UiPreferences } from "@acadigma/contracts"

export function isUiMode(value: string | null | undefined): value is UiMode {
  return uiModeSchema.safeParse(value).success
}

export function isTextSize(
  value: string | null | undefined
): value is TextSize {
  return textSizeSchema.safeParse(value).success
}

export type ResolveUiPrefsInput = {
  cookie: {
    uiMode?: string | null
    textSize?: string | null
  }
  /** The stored row, or `null` when there is none yet or it could not be read. */
  row: { uiMode: UiMode; textSize: TextSize } | null
}

const DEFAULTS: UiPreferences = { uiMode: "full", textSize: "normal" }

export function resolveUiPrefs(input: ResolveUiPrefsInput): UiPreferences {
  const uiMode = isUiMode(input.cookie.uiMode)
    ? input.cookie.uiMode
    : (input.row?.uiMode ?? DEFAULTS.uiMode)

  const textSize = isTextSize(input.cookie.textSize)
    ? input.cookie.textSize
    : (input.row?.textSize ?? DEFAULTS.textSize)

  return { uiMode, textSize }
}
