import Link from "next/link"

import { LogOutIcon, SettingsIcon } from "lucide-react"

import { buttonVariants } from "@acadigma/ui/components/button-variants"

import { signOut } from "@/app/(auth)/actions"
import { GuardedSignOutButton } from "@/app/(shared)/offline/sign-out-guard"
import type { Locale } from "@/lib/locale"

import { LanguageSwitchButton } from "./language-switch-button"
import { SwitchToFullAppButton } from "./switch-to-full-app-button"

/**
 * `buttonVariants` (not `Button`) is imported from the radix-free
 * `components/button-variants` path — see that file's docblock — so this
 * Server Component's classes stay computed from the real, current variants
 * instead of a literal string that silently drifts from them (review fix,
 * PR #72: the old inlined copy predated D-57's `active:translate-y-px`
 * press feedback and the `aria-invalid`/disabled states, so it looked like
 * a plain button rather than this app's real one). `text-base` (not the
 * variants' default `text-sm`) matches §5.1's basic-mode body size.
 */
const ROW_BUTTON_CLASSNAME = buttonVariants({
  variant: "outline",
  size: "lg",
  className: "min-h-14 text-base",
})

/**
 * F-ID-10 §4.4.3 "Essentials row": Settings · Language · Switch to full app
 * · Sign out. Help is deliberately not repeated here (D-405) — it already
 * sits in `BasicShell`'s top bar on every basic screen including this one
 * (§4.7), and a second button opening the identical sheet would be a
 * redundant control, not a second feature.
 *
 * Review fix (BLOCKER, PR #72): basic mode replaces the whole shell below
 * `AppShell`'s `TopBar` (`(school)/app/layout.tsx`), so its `UserMenu` —
 * the only place with Sign out and the language switch — disappeared with
 * it. Both are now here instead, icon + label, `min-h-14` like every other
 * item in this row. "Profile" is dropped (was D-405 item 6's placeholder
 * link to `/account/security`, a layout-less dead end with no Home button
 * of its own) rather than given a shell — no real profile screen exists
 * anywhere in this app yet to link to (see D-405's review addendum).
 * "Settings" reuses `/app/settings`, which already routes a teacher/staff
 * to the read-only overview and an owner/admin to the full grouped list —
 * no basic-specific settings screen was in this Part's file list.
 */
export function EssentialsRow({
  t,
  locale,
}: {
  t: {
    settingsLabel: string
    switchToFullApp: string
    signOut: string
    languageToggle: { bn: string; en: string }
  }
  locale: Locale
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/app/settings" className={ROW_BUTTON_CLASSNAME}>
        <SettingsIcon className="size-7" aria-hidden="true" />
        {t.settingsLabel}
      </Link>
      <LanguageSwitchButton locale={locale} labels={t.languageToggle} />
      <SwitchToFullAppButton label={t.switchToFullApp} />
      {/* F-ID-11 §4.7 (D-309): asks first if changes wait on the phone. */}
      <GuardedSignOutButton
        signOutNow={signOut}
        className={ROW_BUTTON_CLASSNAME}
      >
        <LogOutIcon className="size-7" aria-hidden="true" />
        {t.signOut}
      </GuardedSignOutButton>
    </div>
  )
}
