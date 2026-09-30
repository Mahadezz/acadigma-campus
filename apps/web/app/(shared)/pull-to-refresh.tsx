"use client"

import * as React from "react"

import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"

/** Pull distance that triggers a refresh (DESIGN-SYSTEM §3.6). */
export const PULL_THRESHOLD = 64
/** Finger travel is damped so a long drag does not run away. */
const DAMPING = 0.5

/** True when the touch began inside something that scrolls on its own. */
function inNestedScroller(el: EventTarget | null): boolean {
  for (let n = el as HTMLElement | null; n && n !== document.body;) {
    const cs = getComputedStyle(n)
    const x =
      /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth
    const y = /(auto|scroll)/.test(cs.overflowY) && n.scrollTop > 0
    if (x || y || n.dataset.noPtr !== undefined) return true
    n = n.parentElement
  }
  return false
}

/**
 * Pull-to-refresh for phone data screens (D-409, app-polish #6). Coarse-pointer
 * only; the page scrolls on the window, so a pull only counts when the window
 * is at the top and the drag is downward. Releasing past the threshold calls
 * `router.refresh()` (a revalidation: scroll position and form state survive).
 * `overscroll-behavior-y: contain` on <html> stops the browser running its own
 * refresh underneath (and covers an installed PWA, which has none).
 *
 * Keyboard and screen-reader users get the same refresh through a real button
 * that appears on focus. Reduced motion: the indicator still shows, without
 * spinning.
 */
export function PullToRefresh({
  label,
  refreshingLabel,
}: {
  label: string
  refreshingLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [pull, setPull] = React.useState(0)
  const startY = React.useRef<number | null>(null)
  const pullRef = React.useRef(0)

  const refresh = React.useCallback(() => {
    startTransition(() => router.refresh())
  }, [router])

  React.useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return
    const root = document.documentElement
    const prev = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = "contain"

    const set = (v: number) => {
      pullRef.current = v
      setPull(v)
    }
    const onStart = (e: TouchEvent) => {
      const busy = document.querySelector('[role="dialog"],[data-vaul-drawer]')
      startY.current =
        window.scrollY <= 0 &&
        e.touches.length === 1 &&
        !busy &&
        !inNestedScroller(e.target)
          ? e.touches[0]!.clientY
          : null
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = (e.touches[0]!.clientY - startY.current) * DAMPING
      if (dy <= 0 || window.scrollY > 0) {
        startY.current = null
        set(0)
        return
      }
      set(Math.min(dy, PULL_THRESHOLD * 1.5))
    }
    const onEnd = () => {
      const armed = startY.current !== null && pullRef.current >= PULL_THRESHOLD
      startY.current = null
      set(0)
      if (armed) refresh()
    }
    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchmove", onMove, { passive: true })
    document.addEventListener("touchend", onEnd)
    document.addEventListener("touchcancel", onEnd)
    return () => {
      root.style.overscrollBehaviorY = prev
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", onEnd)
    }
  }, [refresh])

  const visible = pending || pull > 24
  // Held at the threshold while refreshing; follows the finger otherwise.
  const y = pending ? PULL_THRESHOLD : pull

  return (
    <>
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="bg-card text-foreground sr-only rounded-md border px-4 focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:z-50 focus:-translate-x-1/2 focus:h-11"
      >
        {pending ? refreshingLabel : label}
      </button>
      <div
        data-slot="pull-to-refresh"
        aria-hidden={!visible}
        style={{ transform: `translate(-50%, ${y - 44}px)` }}
        className={`glass-panel pointer-events-none fixed top-16 left-1/2 z-40 flex size-11 items-center justify-center rounded-full border shadow-sm${visible ? "" : " invisible"}`}
      >
        <RefreshCwIcon
          className={`size-5 ${pending ? "motion-safe:animate-spin" : ""}`}
          style={{
            transform: pending
              ? undefined
              : `rotate(${(pull / PULL_THRESHOLD) * 270}deg)`,
          }}
        />
      </div>
      <span role="status" className="sr-only">
        {pending ? refreshingLabel : ""}
      </span>
    </>
  )
}
