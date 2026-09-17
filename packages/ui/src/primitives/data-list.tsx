"use client"

import * as React from "react"

import { Skeleton } from "../components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table"
import { useVirtualRange } from "../hooks/use-virtual-range"
import { cn } from "../lib/utils"

import { EmptyState } from "./empty-state"

/**
 * The one list shell (DESIGN-SYSTEM §4.3): rows separated by a hairline rule
 * on a phone, a table from `lg` up — both from the same `items` and the same
 * column definitions, so a column added for the table shows up on the phone
 * row too. **Rules, not cards** (DECISION-LOG D-22/2): a bordered card per row
 * is denser-looking but literally denser data is what a 360px teacher wants,
 * so rows are plain, divided by `--rule`, never individually boxed.
 *
 * Filtering, sorting and paging are the server's job — `items` is always
 * exactly the page(s) the server returned. There is deliberately no
 * client-side filter prop. `hasMore`/`onLoadMore`/`isLoadingMore` wire up
 * cursor pagination (§5.6): a visible "Load more" row on every breakpoint,
 * plus an auto-triggering sentinel on the phone's infinite scroll.
 *
 * Virtualised above 50 rows (§5.6) with a fixed-row-height windower
 * (`useVirtualRange`) — real for a 2,500-student Pro-plan school once enough
 * pages have loaded to matter.
 */
export type DataListColumn<T> = {
  /** Stable key; also the column's React key. */
  key: string
  /** Column heading in the desktop table, and the label on the phone row. */
  header: React.ReactNode
  /** Cell contents for one row. */
  cell: (item: T) => React.ReactNode
  /** Keep this column out of the phone row — it is already in the title line. */
  hideOnCard?: boolean
  className?: string
}

export type DataListProps<T> = {
  items: readonly T[]
  columns: readonly DataListColumn<T>[]
  /** Stable identity for React keys. Use the row's uuid. */
  getRowId: (item: T) => string
  /** Headline for the phone row, e.g. the student's name. */
  renderCardTitle: (item: T) => React.ReactNode
  /** Wraps each row so the whole row is one tap target. */
  renderRowAction?: (item: T, children: React.ReactNode) => React.ReactNode
  /** Shown when `items` is empty and nothing is loading. */
  empty?: React.ReactNode
  isLoading?: boolean
  /** Placeholder rows while loading. Match the usual page size. */
  loadingRows?: number
  /** Accessible name for the table. */
  caption?: string
  className?: string

  // Cursor pagination (§5.6) — the server's cursor, not a page number.
  /** True while a later page exists to fetch. */
  hasMore?: boolean
  /** True while `onLoadMore`'s request is in flight. */
  isLoadingMore?: boolean
  /** Fetch the next page. Omit to disable pagination UI entirely. */
  onLoadMore?: () => void

  // Virtualisation (§5.6: "virtualise above 50 rows").
  /** Defaults to `true` once `items.length > 50`. */
  virtualize?: boolean
  /** Every row's fixed height in px. Defaults to `--size-row` (60). */
  rowHeight?: number
  /** Rows rendered beyond the visible window on each side. */
  overscan?: number
  /** Scroll viewport height when virtualising. Defaults to 480px. */
  viewportHeight?: number
}

const DEFAULT_ROW_HEIGHT = 60
const VIRTUALIZE_THRESHOLD = 50

export function DataList<T>({
  items,
  columns,
  getRowId,
  renderCardTitle,
  renderRowAction,
  empty,
  isLoading = false,
  loadingRows = 6,
  caption,
  className,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  virtualize,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = 6,
  viewportHeight = 480,
}: DataListProps<T>) {
  const shouldVirtualize = virtualize ?? items.length > VIRTUALIZE_THRESHOLD
  const cardScrollRef = React.useRef<HTMLDivElement>(null)
  const tableScrollRef = React.useRef<HTMLDivElement>(null)

  const cardRange = useVirtualRange({
    containerRef: cardScrollRef,
    count: items.length,
    rowHeight,
    overscan,
    enabled: shouldVirtualize,
  })
  const tableRange = useVirtualRange({
    containerRef: tableScrollRef,
    count: items.length,
    rowHeight,
    overscan,
    enabled: shouldVirtualize,
  })

  if (isLoading) {
    return <DataListSkeleton rows={loadingRows} className={className} />
  }

  if (items.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  }

  const cardColumns = columns.filter((column) => !column.hideOnCard)
  const cardItems = shouldVirtualize
    ? items.slice(cardRange.startIndex, cardRange.endIndex + 1)
    : items
  const tableItems = shouldVirtualize
    ? items.slice(tableRange.startIndex, tableRange.endIndex + 1)
    : items

  return (
    <div className={className}>
      {/* Phone: rows separated by a rule, never a bordered card (D-22/2). */}
      <div
        ref={cardScrollRef}
        className={cn("lg:hidden", shouldVirtualize && "overflow-y-auto")}
        style={shouldVirtualize ? { maxHeight: viewportHeight } : undefined}
      >
        <ul className="divide-border flex flex-col divide-y" role="list">
          {shouldVirtualize && cardRange.paddingTop > 0 ? (
            <li aria-hidden="true" style={{ height: cardRange.paddingTop }} />
          ) : null}
          {cardItems.map((item) => {
            const row = (
              <div
                className="flex flex-col gap-2 py-3"
                style={{ minHeight: rowHeight }}
              >
                <p className="text-sm font-medium">{renderCardTitle(item)}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {cardColumns.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-muted-foreground truncate text-xs">
                        {column.header}
                      </dt>
                      <dd className="truncate">{column.cell(item)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
            return (
              <li key={getRowId(item)}>
                {renderRowAction ? renderRowAction(item, row) : row}
              </li>
            )
          })}
          {shouldVirtualize && cardRange.paddingBottom > 0 ? (
            <li
              aria-hidden="true"
              style={{ height: cardRange.paddingBottom }}
            />
          ) : null}
        </ul>
        {!shouldVirtualize && onLoadMore ? (
          <LoadMoreControl
            scope="phone"
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
          />
        ) : null}
      </div>
      {shouldVirtualize && onLoadMore ? (
        <div className="lg:hidden">
          <LoadMoreControl
            scope="phone"
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
          />
        </div>
      ) : null}

      {/* Desktop: the same data as a table. */}
      <div
        ref={tableScrollRef}
        className={cn("hidden lg:block", shouldVirtualize && "overflow-y-auto")}
        style={shouldVirtualize ? { maxHeight: viewportHeight } : undefined}
      >
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shouldVirtualize && tableRange.paddingTop > 0 ? (
              <TableRow aria-hidden="true">
                <TableCell
                  colSpan={columns.length}
                  style={{ height: tableRange.paddingTop, padding: 0 }}
                />
              </TableRow>
            ) : null}
            {tableItems.map((item) => {
              const row = (
                <TableRow key={getRowId(item)} style={{ height: rowHeight }}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell(item)}
                    </TableCell>
                  ))}
                </TableRow>
              )
              return renderRowAction ? renderRowAction(item, row) : row
            })}
            {shouldVirtualize && tableRange.paddingBottom > 0 ? (
              <TableRow aria-hidden="true">
                <TableCell
                  colSpan={columns.length}
                  style={{ height: tableRange.paddingBottom, padding: 0 }}
                />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {onLoadMore ? (
          <LoadMoreControl
            scope="desktop"
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * One "Load more" row + its own sentinel and `IntersectionObserver`.
 * Instantiated once per breakpoint tree (phone, desktop) so each gets its own
 * ref — the phone and desktop trees both mount simultaneously (CSS, not JS,
 * decides which is visible via `lg:hidden`/`hidden lg:block`), so sharing one
 * ref between two DOM nodes means the observer only ever watches whichever
 * one React attached last, and the other breakpoint's auto-load-on-scroll
 * silently never fires.
 */
function LoadMoreControl({
  scope,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  /** Distinguishes the phone vs desktop instance; test-only hook. */
  scope: "phone" | "desktop"
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}) {
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  // Infinite scroll: the phone's non-scroll equivalent is the always-visible
  // "Load more" row rendered below (§5.6 — "a visible Load more as the
  // non-scroll equivalent").
  React.useEffect(() => {
    if (!hasMore || isLoadingMore) return
    const node = sentinelRef.current
    if (!node || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
      },
      { rootMargin: "300px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [onLoadMore, hasMore, isLoadingMore])

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      {isLoadingMore ? (
        <span className="text-muted-foreground text-xs">Loading…</span>
      ) : hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-primary hover:underline focus-visible:ring-ring min-h-11 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2"
        >
          Load more
        </button>
      ) : null}
      {/* Auto-fires onLoadMore ~300px before it scrolls into view. */}
      <div
        ref={sentinelRef}
        aria-hidden="true"
        data-load-more-scope={scope}
        className="h-px w-full"
      />
    </div>
  )
}

/** Loading placeholder shaped like the list it replaces, to avoid layout shift. */
export function DataListSkeleton({
  rows = 6,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg lg:h-12" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
