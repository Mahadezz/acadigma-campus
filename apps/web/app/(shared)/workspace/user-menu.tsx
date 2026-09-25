"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import { UserRoundIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@acadigma/ui/components/dropdown-menu"

import { isLocale, setLocaleCookie, type Locale } from "@/lib/locale"

export type UserMenuProps = {
  locale: Locale
  t: {
    ariaLabel: string
    languageLabel: string
    /** `t.auth.languageToggle` — the same two labels the signed-out toggle uses. */
    bn: string
    en: string
  }
}

/**
 * F-ID-02 §4.3's language switch, cut down to the demo slice: every signed-in
 * shell's top bar (school/personal/family, `TopBar`'s `actions` slot) gets
 * this instead of only the signed-out `LanguageToggle` (`(auth)/language-toggle.tsx`).
 * Same cookie, same `setLocaleCookie` writer — a teacher who switches to
 * বাংলা here and one who switches on `/login` land on the same mechanism.
 *
 * A `DropdownMenu` + `RadioGroup` (both existing `packages/ui` shadcn
 * primitives) rather than a bespoke toggle, since a menu is where a "switch
 * language" action already reads as an account-level setting and the rest of
 * F-ID-02 (profile, theme, sign out) has a home to grow into without a
 * second component.
 */
export function UserMenu({ locale, t }: UserMenuProps) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()

  function handleChange(next: string) {
    if (!isLocale(next) || next === locale) return
    setLocaleCookie(next)
    startTransition(() => router.refresh())
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.ariaLabel}>
          <UserRoundIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t.languageLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="bn">{t.bn}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">{t.en}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
