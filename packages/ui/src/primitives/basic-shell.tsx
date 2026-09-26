"use client"

import * as React from "react"

import { CircleHelpIcon, HomeIcon } from "lucide-react"

import { Button } from "../components/ui/button"

import { AppShell } from "./app-shell"
import { TopBar } from "./top-bar"

import type { HelpSheetProps } from "./help-sheet"
import type { SimpleLinkRenderer } from "./link-renderer"

/**
 * `HelpSheet` pulls in the Radix Dialog primitive behind `Sheet`
 * (`components/ui/sheet.tsx`) — measured at ~80 kB gzipped the first time a
 * route needs it (F-ID-10 Part 1 §6 already hit an unrelated ~70 kB Next
 * chunking surprise on this same route; this is that codebase's second one).
 * `/app/home` had never used Sheet/Dialog before this Part and pushed past
 * the 250 kB `check-bundle-budget.mjs` budget once `HelpSheet` was a plain
 * synchronous import. `React.lazy` (not `next/dynamic` — this package never
 * depends on `next`) moves it into its own chunk, fetched only once Help is
 * actually tapped, which is exactly when a teacher needs it and never
 * before.
 */
const HelpSheet = React.lazy(() =>
  import("./help-sheet").then((m) => ({ default: m.HelpSheet }))
)

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
  // The lazy chunk is fetched the first time it is actually needed, not on
  // page load — mounted once and left mounted so closing/reopening the
  // sheet never re-fetches it.
  const [helpMounted, setHelpMounted] = React.useState(false)

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
                onClick={() => {
                  setHelpMounted(true)
                  setHelpOpen(true)
                }}
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
      {helpMounted ? (
        <React.Suspense fallback={null}>
          <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} {...help} />
        </React.Suspense>
      ) : null}
    </>
  )
}
