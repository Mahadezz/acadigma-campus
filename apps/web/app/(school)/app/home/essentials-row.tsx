import Link from "next/link"

import { SettingsIcon, UserIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"

import { SwitchToFullAppButton } from "./switch-to-full-app-button"

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
      <Button asChild variant="outline" size="lg" className="min-h-14 gap-2">
        <Link href="/account/security">
          <UserIcon className="size-7" aria-hidden="true" />
          {t.profile}
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg" className="min-h-14 gap-2">
        <Link href="/app/settings">
          <SettingsIcon className="size-7" aria-hidden="true" />
          {t.settingsLabel}
        </Link>
      </Button>
      <SwitchToFullAppButton label={t.switchToFullApp} />
    </div>
  )
}
