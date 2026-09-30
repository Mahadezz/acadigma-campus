"use client"

import * as React from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import type { MembershipSummary } from "@acadigma/contracts"

import { navLabel, type BackTarget } from "@/lib/back-route"
import { canGoBack } from "@/lib/in-app-history"

/**
 * D-408: the shell's one back affordance — top-left, where every phone app
 * puts it (Jakob). A 48px chevron on phone and tablet; chevron + the parent
 * page's name from `lg` up. Shown on every page that is not a top-level nav
 * destination (`backTarget` decides).
 *
 * Behaviour: with in-app history it steps back (`router.back()`), so the
 * browser, the Android back button and this chevron all agree; with none
 * (a deep link, a new tab, a reload) it is a plain link to the logical
 * parent, so it never dead-ends and never leaves the app.
 *
 * The href is known on first render; a nav destination's *name* (desktop
 * label, screen-reader text) comes from the nav configs, loaded lazily so
 * they stay out of every page's first-load JS (250 kB budget). Until then
 * it reads "Back".
 *
 * Loaded lazily by `WorkspaceSwitcher` (`next/dynamic`, still server
 * rendered): the whole control stays out of every page's first-load JS.
 */

type Named = { href: string; labelEn: string; labelBn: string }

/** The target's name: its own, or its nav item's in the member's config. */
function useNamed(
  target: BackTarget,
  workspace: MembershipSummary | undefined
): Named | undefined {
  const [loaded, setLoaded] = React.useState<Named>()
  React.useEffect(() => {
    if (target.labelEn || !workspace) return
    let live = true
    void import("@acadigma/domain/nav").then(({ getNavConfig }) => {
      const label = navLabel(
        target.href,
        getNavConfig(workspace.type, workspace.role)
      )
      if (live && label) setLoaded({ href: target.href, ...label })
    })
    return () => {
      live = false
    }
  }, [target.href, target.labelEn, workspace])
  if (target.labelEn && target.labelBn) {
    return {
      href: target.href,
      labelEn: target.labelEn,
      labelBn: target.labelBn,
    }
  }
  return loaded?.href === target.href ? loaded : undefined
}

export function ShellBack({
  target,
  workspace,
}: {
  target: BackTarget
  workspace: MembershipSummary | undefined
}) {
  const router = useRouter()
  const named = useNamed(target, workspace)
  return (
    <Link
      href={target.href}
      onClick={(event) => {
        if (canGoBack() && !event.metaKey && !event.ctrlKey) {
          event.preventDefault()
          router.back()
        }
      }}
      className="text-foreground hover:bg-foreground/[0.06] focus-visible:ring-ring -ml-2 inline-flex min-h-12 min-w-12 items-center justify-center gap-0.5 rounded-xl text-sm font-medium outline-none transition-[background-color,transform] duration-150 focus-visible:ring-2 active:scale-95 lg:justify-start lg:pr-3 lg:pl-1"
    >
      <ChevronLeftIcon className="size-6 shrink-0" aria-hidden="true" />
      {/* Both languages are rendered and the page's own <html lang> picks
          one, so this client component needs no locale prop and server and
          client render the same markup. */}
      <span lang="en" className="[html[lang=bn]_&]:hidden">
        <span className="sr-only">
          {named ? `Back to ${named.labelEn}` : "Back"}
        </span>
        <span aria-hidden="true" className="hidden lg:inline">
          {named?.labelEn ?? "Back"}
        </span>
      </span>
      <span lang="bn" className="[html:not([lang=bn])_&]:hidden">
        <span className="sr-only">
          {named ? `ফিরে যান: ${named.labelBn}` : "ফিরে যান"}
        </span>
        <span aria-hidden="true" className="hidden lg:inline">
          {named?.labelBn ?? "ফিরে যান"}
        </span>
      </span>
    </Link>
  )
}
