"use client"

import * as React from "react"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import type { MembershipSummary } from "@acadigma/contracts"
import { getNavConfig } from "@acadigma/domain/nav"

import { backTarget } from "@/lib/back-route"
import { onlyImplemented } from "@/lib/implemented-routes"

/**
 * D-408: the shell's one back affordance — top-left, where every phone app
 * puts it (Jakob). A 44px chevron on phone and tablet; chevron + the parent
 * page's name from `lg` up. Shown on every page that is not a top-level nav
 * destination (`backTarget` decides).
 *
 * Behaviour: with in-app history it steps back (`router.back()`), so the
 * browser, the Android back button and this chevron all agree; with none
 * (a deep link, a new tab, a reload) it is a plain link to the logical
 * parent, so it never dead-ends and never leaves the app.
 */

// Pathnames visited in this tab since the app loaded. Module scope, so it
// survives shell remounts and resets on a full load — exactly "in-app".
const visited: string[] = []
// Set by the browser's own back/forward (and router.back()), so a Link
// that happens to revisit an earlier page still counts as a new visit.
let popped = false
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    popped = true
  })
}

/** Exported for shell-back.test.ts. */
export function record(pathname: string) {
  if (visited.at(-1) !== pathname) {
    if (popped && visited.at(-2) === pathname) visited.pop()
    else visited.push(pathname)
  }
  popped = false
}

export const canGoBack = () => visited.length > 1

export function useBackTarget(current: MembershipSummary | undefined) {
  const pathname = usePathname()
  React.useEffect(() => record(pathname), [pathname])
  return React.useMemo(() => {
    const config = current ? getNavConfig(current.type, current.role) : null
    return backTarget(pathname, config ? onlyImplemented(config) : null)
  }, [pathname, current])
}

export function ShellBack({
  target,
}: {
  target: NonNullable<ReturnType<typeof useBackTarget>>
}) {
  const router = useRouter()
  return (
    <Link
      href={target.href}
      onClick={(event) => {
        if (canGoBack() && !event.metaKey && !event.ctrlKey) {
          event.preventDefault()
          router.back()
        }
      }}
      className="text-foreground hover:bg-foreground/[0.06] focus-visible:ring-ring -ml-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-xl text-sm font-medium outline-none transition-[background-color,transform] duration-150 focus-visible:ring-2 active:scale-95 lg:justify-start lg:pr-3 lg:pl-1"
    >
      <ChevronLeftIcon className="size-6 shrink-0" aria-hidden="true" />
      {/* Both languages are rendered and the page's own <html lang> picks
          one, so this client component needs no locale prop and server and
          client render the same markup. */}
      <span lang="en" className="[html[lang=bn]_&]:hidden">
        <span className="sr-only">{`Back to ${target.labelEn}`}</span>
        <span aria-hidden="true" className="hidden lg:inline">
          {target.labelEn}
        </span>
      </span>
      <span lang="bn" className="[html:not([lang=bn])_&]:hidden">
        <span className="sr-only">{`ফিরে যান: ${target.labelBn}`}</span>
        <span aria-hidden="true" className="hidden lg:inline">
          {target.labelBn}
        </span>
      </span>
    </Link>
  )
}
