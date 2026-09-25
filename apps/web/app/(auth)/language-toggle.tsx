"use client"

import { useTransition } from "react"

import { useRouter } from "next/navigation"

import { setLocaleCookie, type Locale } from "@/lib/locale"

/**
 * "বাংলা · English" at the bottom of every auth screen (DESIGN-SYSTEM §8.2
 * wireframe 1: "in the thumb zone ... the first thing a Bengali-first user
 * looks for"). Writes the locale cookie `lib/i18n.ts` reads server-side, then
 * refreshes so the next render picks it up. Imports from `lib/locale` (not
 * `lib/i18n`, which is `server-only`) so this client component's bundle never
 * pulls in `next/headers`. `setLocaleCookie` is shared with the signed-in
 * app's `UserMenu` language switch (`(shared)/workspace/user-menu.tsx`), one
 * cookie-writer for both entry points.
 */
export function LanguageToggle({ current }: { current: Locale }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function setLocale(locale: Locale) {
    if (locale === current) return
    setLocaleCookie(locale)
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex justify-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => setLocale("bn")}
        aria-pressed={current === "bn"}
        className={current === "bn" ? "font-semibold" : "text-muted-foreground"}
      >
        বাংলা
      </button>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={current === "en"}
        className={current === "en" ? "font-semibold" : "text-muted-foreground"}
      >
        English
      </button>
    </div>
  )
}
