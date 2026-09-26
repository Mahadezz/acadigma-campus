"use client"

import * as React from "react"

import { usePathname } from "next/navigation"

import { WifiOffIcon } from "lucide-react"

import type { Messages } from "@/lib/i18n"
import {
  cachePageForOffline,
  hasOfflineState,
  purgeOnSignOut,
  runOfflineCheck,
} from "@/lib/offline/check"
import { useOnline } from "@/lib/offline/use-online"

export type OfflineCopy = Messages["offline"]

const OfflineCopyContext = React.createContext<OfflineCopy | null>(null)

/**
 * The offline copy in the reader's language (root layout → Providers). Read
 * it only when showing offline text: a component rendered online outside the
 * provider (unit tests) never needs it.
 */
export function useOfflineCopy(): () => OfflineCopy {
  const copy = React.useContext(OfflineCopyContext)
  return () => {
    if (!copy) throw new Error("offline copy used outside OfflineProvider")
    return copy
  }
}

const SHELL_PATH = /^\/(app|family|personal)(\/|$)/

/**
 * F-ID-11 Part 1 (D-308), mounted once for every page:
 *
 * - **The purge check (§4.8)** on every app open and every return online: who
 *   is signed in, where, with which role — any change wipes the page cache.
 *   Skipped for a visitor with nothing cached and nothing remembered (the
 *   marketing site), so they never call the API.
 * - The same check on entering a shell from outside it (sign-in, invite,
 *   new school), and an unconditional wipe on arriving at `/login`.
 * - **The in-app navigation copy**: a signed-in page reached by a client-side
 *   navigation is stored for offline reading too (`cachePageForOffline`).
 * - **The offline banner** (DESIGN-SYSTEM §3.10, offline state only in Part 1).
 */
export function OfflineProvider({
  copy,
  children,
}: {
  copy: OfflineCopy
  children: React.ReactNode
}) {
  const online = useOnline()
  const pathname = usePathname()
  const prevPath = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!online) return
    void (async () => {
      const inShell = SHELL_PATH.test(location.pathname)
      if (!inShell && !(await hasOfflineState())) return
      // A purge also took this page's own copy: store it again (the user
      // now in the snapshot is the one looking at it).
      if ((await runOfflineCheck()) && inShell) {
        cachePageForOffline(location.href)
      }
    })()
  }, [online])

  React.useEffect(() => {
    const prev = prevPath.current
    prevPath.current = pathname
    // Sign-outs and expired sessions end on /login: wipe there without
    // asking the server, so a failed check cannot leave the pages behind.
    if (pathname === "/login") void purgeOnSignOut()
    // The first page load is cached by the worker itself.
    if (prev === null) return
    if (!SHELL_PATH.test(pathname)) return
    // Arriving in a shell from outside it (sign-in, accepting an invite,
    // creating a school) can mean a new user or workspace: check first, and
    // copy the page only after, so a purge does not throw the copy away.
    const href = location.href
    if (SHELL_PATH.test(prev)) cachePageForOffline(href)
    else void runOfflineCheck().then(() => cachePageForOffline(href))
  }, [pathname])

  return (
    <OfflineCopyContext.Provider value={copy}>
      {/* Always mounted, so screen readers announce the text when it appears. */}
      <div
        role="status"
        aria-live="polite"
        className={
          online
            ? "sr-only"
            : "bg-warning-soft text-warning-ink border-warning sticky top-0 z-[100] flex min-h-9 items-center gap-2 border-b px-4 py-1.5 text-sm"
        }
      >
        {online ? null : (
          <>
            <WifiOffIcon className="size-4 shrink-0" aria-hidden="true" />
            {copy.banner}
          </>
        )}
      </div>
      {children}
    </OfflineCopyContext.Provider>
  )
}
