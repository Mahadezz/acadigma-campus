"use client"

import * as React from "react"

import Link from "next/link"

import { Input } from "@acadigma/ui/components/input"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

export type AllClassesRow = { sectionId: string; name: string }

/**
 * F-ID-10 §4.4 footnote ¹ — client-side filter over the school's sections
 * (a school's whole class list is small; no server round trip per
 * keystroke). Each row goes straight to the existing roll call for that
 * section, the same interim destination the home blocks use (D-405) — the
 * class hub (Part 3) replaces both.
 */
export function AllClassesView({
  rows,
  t,
}: {
  rows: AllClassesRow[]
  t: {
    title: string
    searchLabel: string
    searchPlaceholder: string
    searchEmpty: string
  }
}) {
  const [query, setQuery] = React.useState("")
  const filtered = rows.filter((row) =>
    row.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{t.title}</h2>
      <div>
        <label htmlFor="all-classes-search" className="sr-only">
          {t.searchLabel}
        </label>
        <Input
          id="all-classes-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="h-14 text-lg"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t.searchEmpty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((row) => (
            <li key={row.sectionId}>
              <Link
                href={`/app/attendance/${row.sectionId}`}
                className="border-border bg-card text-card-foreground focus-visible:ring-ring flex min-h-14 w-full items-center rounded-lg border p-4 text-lg font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden active:opacity-90"
              >
                {row.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
