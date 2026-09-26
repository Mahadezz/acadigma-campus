"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import { LanguagesIcon } from "lucide-react"

import { buttonVariants } from "@acadigma/ui/components/button-variants"

import { updateLocale } from "@/app/(shared)/workspace/actions"
import { setLocaleCookie, type Locale } from "@/lib/locale"

/**
 * F-ID-10 essentials row (review fix, PR #72 BLOCKER 1): basic mode has no
 * `UserMenu` (`(school)/app/layout.tsx`'s basic branch renders
 * `BasicShellWrapper`, not `AppShell`'s `TopBar`), so its only language
 * switch disappeared along with it. One tap swaps to the other language —
 * the same mechanism `UserMenu`'s language `DropdownMenuRadioGroup` uses
 * (`setLocaleCookie` + `updateLocale` + `router.refresh()`) — styled as an
 * icon+label 56px button so it matches the rest of this row instead of
 * `UserMenu`'s dropdown or the signed-out `LanguageToggle`'s small text.
 */
export function LanguageSwitchButton({
  locale,
  labels,
}: {
  locale: Locale
  labels: { bn: string; en: string }
}) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()
  const next: Locale = locale === "bn" ? "en" : "bn"

  function handleClick() {
    setLocaleCookie(next)
    startTransition(async () => {
      // Best-effort, same as `UserMenu`: the cookie already made the switch
      // take effect on this device.
      await updateLocale(next).catch(() => undefined)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={buttonVariants({
        variant: "outline",
        size: "lg",
        className: "min-h-14 text-base",
      })}
    >
      <LanguagesIcon className="size-7" aria-hidden="true" />
      {labels[next]}
    </button>
  )
}
