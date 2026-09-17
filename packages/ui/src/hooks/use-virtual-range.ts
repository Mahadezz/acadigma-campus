import * as React from "react"

/**
 * Minimal fixed-row-height virtualiser for `DataList` (DESIGN-SYSTEM §5.6:
 * "Virtualise above 50 rows"). Deliberately not a general-purpose library:
 * every row is assumed the same height (`--size-row` / `--size-row-dense`),
 * which is true for every list in this product — rows never vary in height
 * within one `DataList`.
 *
 * Renders only `[startIndex, endIndex]` plus `overscan` rows on each side, and
 * reports `paddingTop`/`paddingBottom` so the caller can keep scrollbar length
 * and scroll position correct with two spacer elements instead of the full row
 * set.
 */
export type VirtualRange = {
  startIndex: number
  /** Inclusive. `-1` when `count` is 0. */
  endIndex: number
  paddingTop: number
  paddingBottom: number
}

function computeRange(
  scrollTop: number,
  clientHeight: number,
  count: number,
  rowHeight: number,
  overscan: number
): VirtualRange {
  if (count === 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: -1, paddingTop: 0, paddingBottom: 0 }
  }
  const visibleCount = Math.max(1, Math.ceil(clientHeight / rowHeight))
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(count - 1, startIndex + visibleCount + overscan * 2)
  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, count - 1 - endIndex) * rowHeight,
  }
}

export function useVirtualRange({
  containerRef,
  count,
  rowHeight,
  overscan = 6,
  enabled = true,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  count: number
  rowHeight: number
  overscan?: number
  enabled?: boolean
}): VirtualRange {
  const [range, setRange] = React.useState<VirtualRange>(() =>
    enabled
      ? computeRange(0, 0, count, rowHeight, overscan)
      : { startIndex: 0, endIndex: count - 1, paddingTop: 0, paddingBottom: 0 }
  )

  React.useEffect(() => {
    if (!enabled) {
      setRange({
        startIndex: 0,
        endIndex: count - 1,
        paddingTop: 0,
        paddingBottom: 0,
      })
      return
    }

    const el = containerRef.current
    if (!el) return

    const update = () => {
      setRange(
        computeRange(el.scrollTop, el.clientHeight, count, rowHeight, overscan)
      )
    }

    update()
    el.addEventListener("scroll", update, { passive: true })

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(update)
      resizeObserver.observe(el)
    }

    return () => {
      el.removeEventListener("scroll", update)
      resizeObserver?.disconnect()
    }
  }, [containerRef, count, rowHeight, overscan, enabled])

  return range
}
