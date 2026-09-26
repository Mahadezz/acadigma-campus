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

/**
 * The root layout always provides the reader's language; this English default
 * only serves components rendered outside it (unit tests).
 */
const OfflineCopyContext = React.createContext<OfflineCopy>({
  banner: "You're offline — showing pages saved on this phone",
  lastUpdated: "Last updated {time}",
  today: "today",
  needsInternet: "Needs internet",
  needsInternetHint:
    "This is made on the server. Connect to the internet to use it.",
})

/** The offline copy in the reader's language (root layout → Providers). */
export function useOfflineCopy(): OfflineCopy {
  return React.useContext(OfflineCopyContext)
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
      if (SHELL_PATH.test(location.pathname) || (await hasOfflineState())) {
        await runOfflineCheck()
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
    // creating a school) can mean a new user or workspace: check first.
    if (!SHELL_PATH.test(prev)) void runOfflineCheck()
    cachePageForOffline(location.href)
  }, [pathname])

  return (
    <OfflineCopyContext.Provider value={copy}>
      {online ? null : (
        <div
          role="status"
          aria-live="polite"
          className="bg-warning-soft text-warning-ink border-warning sticky top-0 z-[100] flex min-h-9 items-center gap-2 border-b px-4 py-1.5 text-sm"
        >
          <WifiOffIcon className="size-4 shrink-0" aria-hidden="true" />
          {copy.banner}
        </div>
      )}
      {children}
    </OfflineCopyContext.Provider>
  )
}
