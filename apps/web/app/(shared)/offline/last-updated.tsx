"use client"

import * as React from "react"

import { usePathname } from "next/navigation"

import { HistoryIcon } from "lucide-react"

import { toIntlLocale, type Locale } from "@/lib/locale"
import { serverClockOffset } from "@/lib/offline/check"
import { useOnline } from "@/lib/offline/use-online"

import { useOfflineCopy } from "./offline-provider"

const noop = () => () => {}

/** Older than this, a page load was answered from the cache, not the server. */
const FRESH_MS = 2 * 60_000

/**
 * F-ID-11 §4.2 "Last updated 09:12 today" (Part 1, D-308).
 *
 * `renderedAt` is the server's clock when the shell rendered. A page the
 * service worker answered from its cache carries the time it was cached, so
 * "this document is old, or we are offline" is exactly "this came from the
 * cache". Only the document the shell was loaded with counts: after an in-app
 * navigation the page below is fresh even though the shell is not.
 */
export function LastUpdated({
  renderedAt,
  locale,
}: {
  renderedAt: number
  locale: Locale
}) {
  const getCopy = useOfflineCopy()
  const online = useOnline()
  const pathname = usePathname()
  const [firstPath] = React.useState(pathname)
  const hydrated = React.useSyncExternalStore(
    noop,
    () => true,
    () => false
  )

  // Only after hydration: the server has no idea when the browser loaded it.
  if (!hydrated || pathname !== firstPath) return null
  // When this document was loaded, on the server's clock (the device clock
  // corrected by the last check's `Date` header), like `renderedAt`.
  const loadedAt = performance.timeOrigin + serverClockOffset()
  if (online && loadedAt - renderedAt < FRESH_MS) return null

  const copy = getCopy()
  const at = new Date(renderedAt)
  const intl = toIntlLocale(locale)
  const time = at.toLocaleTimeString(intl, {
    hour: "2-digit",
    minute: "2-digit",
  })
  const sameDay = at.toDateString() === new Date(loadedAt).toDateString()
  const when = sameDay
    ? `${time} ${copy.today}`
    : `${at.toLocaleDateString(intl, { day: "numeric", month: "short" })}, ${time}`

  return (
    <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-sm">
      <HistoryIcon className="size-4 shrink-0" aria-hidden="true" />
      <span data-testid="last-updated">
        {copy.lastUpdated.replace("{time}", when)}
      </span>
    </p>
  )
}
