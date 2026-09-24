"use client"

import { useState } from "react"

import { buildDiffRows, redactionCopy } from "@acadigma/domain/audit"

/**
 * Field-by-field before/after (F-ID-09 §4.3, §6). `<del>`/`<ins>` so a screen
 * reader announces before and after semantics (§6 accessibility note), redacted
 * values render as `••••` with a "Why is this hidden?" toggle rather than a link
 * to a separate page — one fewer navigation for something that is, on a phone, a
 * single sentence of copy.
 */
export function DiffView({
  before,
  after,
  changedFields,
  language,
}: {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  changedFields: readonly string[] | null
  language: "en" | "bn"
}) {
  const rows = buildDiffRows(before, after, changedFields)

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {language === "bn" ? "কিছু পরিবর্তিত হয়নি" : "Nothing changed"}
      </p>
    )
  }

  return (
    <dl className="divide-border divide-y">
      {rows.map((row) => (
        <DiffRow key={row.field} {...row} language={language} />
      ))}
    </dl>
  )
}

function DiffRow({
  field,
  before,
  after,
  isRedactedValue,
  language,
}: {
  field: string
  before: unknown
  after: unknown
  isRedactedValue: boolean
  language: "en" | "bn"
}) {
  const [showWhy, setShowWhy] = useState(false)

  return (
    <div className="py-2.5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {field.replace(/_/g, " ")}
      </dt>
      <dd className="mt-1 flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:gap-3">
        {isRedactedValue ? (
          <>
            <span
              aria-label={
                language === "bn"
                  ? "গোপনীয়তার জন্য লুকানো"
                  : "hidden for privacy"
              }
            >
              ••••
            </span>
            <button
              type="button"
              className="text-primary min-h-11 text-left text-xs underline underline-offset-2 sm:min-h-0"
              onClick={() => setShowWhy((value) => !value)}
              aria-expanded={showWhy}
            >
              {language === "bn" ? "কেন এটি লুকানো?" : "Why is this hidden?"}
            </button>
          </>
        ) : (
          <>
            <del className="text-muted-foreground no-underline">
              <span className="line-through">{formatValue(before)}</span>
            </del>
            <span aria-hidden="true">→</span>
            <ins className="font-medium no-underline">{formatValue(after)}</ins>
          </>
        )}
      </dd>
      {isRedactedValue && showWhy ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {redactionCopy("free_text", language)}
        </p>
      ) : null}
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  return JSON.stringify(value)
}
