"use client"

import * as React from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import {
  LayoutGridIcon,
  LogOutIcon,
  PaintbrushIcon,
  UserRoundIcon,
} from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acadigma/ui/components/dropdown-menu"

import { signOut } from "@/app/(auth)/actions"
import type { Locale } from "@/lib/locale"

import { useGuardedSignOut } from "../offline/sign-out-guard"

import { updateUiPreferences } from "./actions"

export type UserMenuProps = {
  locale: Locale
  /** The signed-in user (`ctx.userId`): whose outbox a sign-out deletes. */
  userId: string
  t: {
    ariaLabel: string
    /** Unused since D-408 (kept: `home/page.tsx`, an open PR's file, still
     * builds and passes this object; removing the field would need to touch
     * that file). See the D-408 docblock note below. */
    languageLabel: string
    bn: string
    en: string
    /** `t.auth.logout.button` — reserved since F-ID-01, unused until now. */
    signOut: string
    /** `t.basicMode.userMenu.switchToBasicMode` — only used when `showBasicModeSwitch`. */
    switchToBasicMode?: string
  }
  /**
   * F-ID-10 §4.2 (D-403): "the full app's user menu has 'Switch to basic
   * mode' so an admin helping a teacher can find it". Only the school shell
   * passes this (`(school)/app/layout.tsx`), and only when the caller's
   * role in the active workspace is not `staff` (F-ID-10 §2 note 4) — the
   * personal/family shells (`GatedShell`) never pass it, so the item simply
   * does not exist there.
   */
  showBasicModeSwitch?: boolean
}

/**
 * D-408: the language switch used to live right here, as an always-open
 * `DropdownMenuRadioGroup` in the header's avatar menu — visible the moment
 * the menu opens, which is exactly the "advertise we're bilingual" pattern
 * the owner asked to stop. It is now one "Appearance" item that links to
 * `/app/settings/appearance` (new this Part), where theme (light/dark/
 * system) and language live together as a normal, tucked-away setting. The
 * old `handleChange`/`isLocale`/`setLocaleCookie`/`updateLocale` wiring moved
 * there with it — see `appearance-form.tsx`.
 *
 * Review follow-up on PR #51: the signed-in shell had no sign-out control
 * anywhere. Reuses the existing `signOut` server action (`(auth)/actions.ts`
 * §4.10 — single-device scope, clears the workspace cookie, redirects to
 * `/login`) rather than a new one; this menu is simply the first place it is
 * wired into the UI.
 */
export function UserMenu({
  locale,
  userId,
  t,
  showBasicModeSwitch,
}: UserMenuProps) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()
  // Inline, not a messages.json key (D-408 deviation note in the docblock
  // above `UserMenuProps`): `apps/web/messages/{en,bn}.json` are being
  // edited by two other open PRs (#82, #105) this Part does not touch.
  // `t.languageLabel` ("Language"/"ভাষা") undersells what this link now
  // opens, so it is not reused here.
  const appearanceLabel = locale === "bn" ? "থিম ও ভাষা" : "Theme & language"

  // F-ID-11 §4.7 (D-308, D-309): asks first if changes are still on the
  // phone; then the outbox and the cached pages go before the session does.
  const guardedSignOut = useGuardedSignOut(() => signOut(), userId)

  function handleSwitchToBasicMode() {
    startTransition(async () => {
      const result = await updateUiPreferences({ uiMode: "basic" })
      if (result.ok) router.push("/app/home")
    })
  }

  return (
    <>
      {guardedSignOut.dialog}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t.ariaLabel}>
            <UserRoundIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/app/settings/appearance">
              <PaintbrushIcon aria-hidden="true" />
              {appearanceLabel}
            </Link>
          </DropdownMenuItem>
          {showBasicModeSwitch && t.switchToBasicMode ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSwitchToBasicMode}>
                <LayoutGridIcon aria-hidden="true" />
                {t.switchToBasicMode}
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={guardedSignOut.request}
          >
            <LogOutIcon aria-hidden="true" />
            {t.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
