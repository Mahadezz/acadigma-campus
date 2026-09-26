import Link from "next/link"

import { SettingsIcon, UserIcon } from "lucide-react"

import { SwitchToFullAppButton } from "./switch-to-full-app-button"

/**
 * Outline/`lg` `Button` classes, inlined rather than imported from
 * `@acadigma/ui/components/button` — same reasoning and the same ~80 kB as
 * `(school)/app/reports/runs/[id]/page.tsx`'s `DOWNLOAD_LINK_CLASSNAME`:
 * that module's `Slot` import (for `asChild`) is not needed for a plain
 * link, and importing it from a Server Component (this file has no "use
 * client") pulled the whole `radix-ui` package into `/app/home`'s
 * first-load JS, over `check-bundle-budget.mjs`'s 250 kB budget.
 * `Button`/`buttonVariants` themselves are otherwise untouched
 * (design-lane owned, DESIGN-SYSTEM/LANES.md).
 */
const OUTLINE_BUTTON_CLASSNAME =
  "inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-md border bg-background px-6 text-sm font-medium whitespace-nowrap shadow-flat transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"

/**
 * F-ID-10 §4.4.3 "Essentials row": Profile · Settings · Help · Switch to
 * full app. Help is deliberately not repeated here (D-405) — it already
 * sits in `BasicShell`'s top bar on every basic screen including this one
 * (§4.7), and a second button opening the identical sheet would be a
 * redundant control, not a second feature.
 *
 * "Profile" has no dedicated screen yet (none exists anywhere in the app,
 * basic or full) — links to `/account/security`, the closest existing
 * personal-account page, until a real profile screen is built (D-405).
 * "Settings" reuses `/app/settings`, which already routes a teacher/staff
 * to the read-only overview and an owner/admin to the full grouped list —
 * no basic-specific settings screen was in this Part's file list.
 */
export function EssentialsRow({
  t,
}: {
  t: {
    profile: string
    settingsLabel: string
    switchToFullApp: string
  }
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/account/security" className={OUTLINE_BUTTON_CLASSNAME}>
        <UserIcon className="size-7" aria-hidden="true" />
        {t.profile}
      </Link>
      <Link href="/app/settings" className={OUTLINE_BUTTON_CLASSNAME}>
        <SettingsIcon className="size-7" aria-hidden="true" />
        {t.settingsLabel}
      </Link>
      <SwitchToFullAppButton label={t.switchToFullApp} />
    </div>
  )
}
