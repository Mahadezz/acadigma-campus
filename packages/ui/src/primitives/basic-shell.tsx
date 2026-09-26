"use client"

import * as React from "react"

import { CircleHelpIcon, HomeIcon } from "lucide-react"

import { Button } from "../components/ui/button"

import { AppShell } from "./app-shell"
import { HelpSheet, type HelpSheetProps } from "./help-sheet"
import { TopBar } from "./top-bar"

import type { SimpleLinkRenderer } from "./link-renderer"

/**
 * F-ID-10 §4.10/§6 "BasicShell" — the frame every basic-mode screen sits in:
 * a top bar with only Home (hidden on the home screen itself), the brand,
 * and Help, and deliberately **no** `bottomNav`/`sidebar` (§4.10: "the home
 * IS the nav"). Wraps the existing `AppShell` rather than reimplementing
 * the frame — this Part only needed a different top bar, not a different
 * scroll region/safe-area handling.
 *
 * `isHome` is a prop, not computed here with `usePathname()`: this package
 * never depends on `next` (see `link-renderer.ts` / `bottom-nav.tsx`'s
 * `NavLinkRenderer`), so the caller — which already has `usePathname()` for
 * its own routing — decides.
 */
export type BasicShellProps = {
  homeHref: string
  homeLabel: string
  isHome: boolean
  brand: React.ReactNode
  helpLabel: string
  help: Omit<HelpSheetProps, "open" | "onOpenChange">
  renderLink: SimpleLinkRenderer
  children: React.ReactNode
}

export function BasicShell({
  homeHref,
  homeLabel,
  isHome,
  brand,
  helpLabel,
  help,
  renderLink,
  children,
}: BasicShellProps) {
  const [helpOpen, setHelpOpen] = React.useState(false)

  return (
    <>
      <AppShell
        topBar={
          <TopBar
            leading={
              isHome
                ? null
                : // §5.1: every basic-mode button is icon AND label.
                  renderLink({
                    href: homeHref,
                    className:
                      "text-foreground inline-flex min-h-14 items-center gap-2 rounded-md px-2 text-base font-medium",
                    children: (
                      <>
                        <HomeIcon className="size-7" aria-hidden="true" />
                        {homeLabel}
                      </>
                    ),
                  })
            }
            title={brand}
            actions={
              <Button
                type="button"
                variant="ghost"
                className="min-h-14 gap-2 px-2"
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelpIcon className="size-7" aria-hidden="true" />
                {helpLabel}
              </Button>
            }
          />
        }
      >
        {children}
      </AppShell>
      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} {...help} />
    </>
  )
}
