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
import { cn } from "../lib/utils"

import { EmptyState } from "./empty-state"

/**
 * The one list shell (ARCHITECTURE §6): stacked cards on a phone, a table from `lg`
 * up. Both layouts are rendered from the same `items` and the same column
 * definitions, so a column added for the table shows up on the phone card too.
 *
 * Filtering, sorting and paging are the server's job — `items` is always exactly the
 * page the server returned. There is deliberately no client-side filter prop.
 */
export type DataListColumn<T> = {
  /** Stable key; also the column's React key. */
  key: string
  /** Column heading in the desktop table, and the label on the phone card. */
  header: React.ReactNode
  /** Cell contents for one row. */
  cell: (item: T) => React.ReactNode
  /** Keep this column out of the phone card — it is already in the title line. */
  hideOnCard?: boolean
  className?: string
}

export type DataListProps<T> = {
  items: readonly T[]
  columns: readonly DataListColumn<T>[]
  /** Stable identity for React keys. Use the row's uuid. */
  getRowId: (item: T) => string
  /** Headline for the phone card, e.g. the student's name. */
  renderCardTitle: (item: T) => React.ReactNode
  /** Wraps each row so the whole card or row is one tap target. */
  renderRowAction?: (item: T, children: React.ReactNode) => React.ReactNode
  /** Shown when `items` is empty and nothing is loading. */
  empty?: React.ReactNode
  isLoading?: boolean
  /** Placeholder rows while loading. Match the usual page size. */
  loadingRows?: number
  /** Accessible name for the table. */
  caption?: string
  className?: string
}

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
}: DataListProps<T>) {
  if (isLoading) {
    return <DataListSkeleton rows={loadingRows} className={className} />
  }

  if (items.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet" />}</>
  }

  const cardColumns = columns.filter((column) => !column.hideOnCard)

  return (
    <div className={className}>
      {/* Phone: one card per row. */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {items.map((item) => {
          const card = (
            <div className="bg-card text-card-foreground border-border rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">
                {renderCardTitle(item)}
              </p>
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
              {renderRowAction ? renderRowAction(item, card) : card}
            </li>
          )
        })}
      </ul>

      {/* Desktop: the same data as a table. */}
      <div className="hidden lg:block">
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
            {items.map((item) => {
              const row = (
                <TableRow key={getRowId(item)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell(item)}
                    </TableCell>
                  ))}
                </TableRow>
              )
              return renderRowAction ? renderRowAction(item, row) : row
            })}
          </TableBody>
        </Table>
      </div>
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
