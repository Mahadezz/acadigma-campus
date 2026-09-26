"use client"

import * as React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { BasicShell } from "@acadigma/ui/primitives/basic-shell"
import type { SimpleLinkRenderer } from "@acadigma/ui/primitives/link-renderer"

const renderLink: SimpleLinkRenderer = ({ href, className, children }) => (
  <Link href={href} className={className}>
    {children}
  </Link>
)

/**
 * F-ID-10 §4.10 (D-405) — the school layout's basic-mode branch renders this
 * instead of the full `AppShell` (sidebar/bottom nav/workspace-switcher top
 * bar) whenever `ui_mode === "basic"` for a non-staff role, for EVERY page
 * under `/app`, not only `/app/home`. Two consequences, both intended:
 *
 * 1. A class block's link to the existing (not basic-sized) roll-call page
 *    (`/app/attendance/[sectionId]`) still opens inside this reduced-chrome
 *    shell, not the full sidebar/bottom-nav one — closer to what a basic-mode
 *    teacher expects than suddenly seeing the full nav (§9 AC17's "deep link
 *    opens inside the basic shell", which Part 2 gets for free this way,
 *    though the Help text for a non-home route falls back to a generic line
 *    until Part 3 adds a per-route catalogue entry for the hub).
 * 2. Only `/app/home` gets the home-specific Help text; everywhere else
 *    shows `defaultLines` — `isHome` is the only routing decision this
 *    wrapper makes, deliberately, so it stays a thin adapter and not a
 *    second router.
 */
export function BasicShellWrapper({
  homeHref,
  homeLabel,
  brand,
  helpLabel,
  helpTitle,
  homeLines,
  defaultLines,
  phone,
  callLabel,
  noPhoneLine,
  addPhoneHref,
  addPhoneLabel,
  goBackLabel,
  children,
}: {
  homeHref: string
  homeLabel: string
  brand: React.ReactNode
  helpLabel: string
  helpTitle: string
  homeLines: string[]
  defaultLines: string[]
  phone: string | null
  callLabel: string
  noPhoneLine: string
  addPhoneHref?: string
  addPhoneLabel?: string
  goBackLabel: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isHome = pathname === homeHref

  return (
    <BasicShell
      homeHref={homeHref}
      homeLabel={homeLabel}
      isHome={isHome}
      brand={brand}
      helpLabel={helpLabel}
      renderLink={renderLink}
      help={{
        title: helpTitle,
        lines: isHome ? homeLines : defaultLines,
        phone,
        callLabel,
        noPhoneLine,
        addPhoneHref,
        addPhoneLabel,
        goBackLabel,
      }}
    >
      {children}
    </BasicShell>
  )
}
