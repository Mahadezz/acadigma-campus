"use client"

import { useState } from "react"

import Link from "next/link"

import { ChevronRightIcon } from "lucide-react"

import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"

export type SettingsRow = {
  href: string
  title: string
  description: string
  keywords: string
  summary: string
}

/**
 * The grouped settings list with its search (F-OP-07 §4 W1). The filter runs
 * over this screen's own static list of settings (title, description,
 * synonyms) — not over a table — so client-side filtering is correct here.
 */
export function SettingsHome({
  rows,
  t,
}: {
  rows: SettingsRow[]
  t: { searchLabel: string; searchPlaceholder: string; searchEmpty: string }
}) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const visible = q
    ? rows.filter((row) =>
        `${row.title} ${row.description} ${row.keywords}`
          .toLowerCase()
          .includes(q)
      )
    : rows

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="settings-search" className="sr-only">
          {t.searchLabel}
        </Label>
        <Input
          id="settings-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          className="min-h-11"
        />
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {t.searchEmpty}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {visible.map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{row.title}</span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {row.summary}
                  </span>
                </span>
                <ChevronRightIcon
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
