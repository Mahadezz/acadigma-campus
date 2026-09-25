"use client"

import { useRef, useState, useTransition } from "react"

import Link from "next/link"

import { ArrowLeftIcon } from "lucide-react"

import type {
  ApiError,
  MarkEntry,
  MarkSheet,
  MarkSheetRow,
  MarkStatus,
} from "@acadigma/contracts"
import { marksProgress, parseMarkInput } from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@acadigma/ui/components/toggle-group"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { cn } from "@acadigma/ui/lib/utils"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { saveMarks } from "../actions"

type T = Messages["marks"]
export type ReadOnlyReason = "notAssigned" | "viewOnly" | "closed" | "locked"
type Issue = keyof T["issues"]

type Row = {
  text: string
  /** Absent or exempt chosen on screen; null = whatever the text says. */
  chosen: "absent" | "exempt" | null
  saved: { status: MarkStatus | null; obtained: number | null }
  updatedAt: string | null
  /** From the last save (CONFLICT, MARK_OUT_OF_RANGE), until the row changes. */
  serverIssue: Issue | null
}

type Current =
  | { kind: "blank" }
  | { kind: "error"; issue: Issue }
  | { kind: "mark"; status: MarkStatus; obtained: number | null }

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]))
}

function fromSaved(r: MarkSheetRow): Row {
  return {
    text:
      r.status === "entered" && r.obtained !== null ? String(r.obtained) : "",
    chosen: r.status === "absent" || r.status === "exempt" ? r.status : null,
    saved: { status: r.status, obtained: r.obtained },
    updatedAt: r.updatedAt,
    serverIssue: null,
  }
}

/** What the row holds now: nothing, an invalid value, or a savable mark. */
export function currentMark(row: Row, fullMarks: number): Current {
  if (row.chosen) return { kind: "mark", status: row.chosen, obtained: null }
  const parsed = parseMarkInput(row.text, fullMarks)
  if (!parsed.ok) return { kind: "error", issue: parsed.issue }
  if (parsed.value === null) {
    return row.saved.status === null
      ? { kind: "blank" }
      : { kind: "error", issue: "CLEARED" }
  }
  return { kind: "mark", status: "entered", obtained: parsed.value }
}

function isDirty(row: Row, current: Current): boolean {
  return (
    current.kind === "mark" &&
    (current.status !== row.saved.status ||
      current.obtained !== row.saved.obtained)
  )
}

export function saveErrorText(t: T, error: ApiError): string {
  if (error.code === "payment_required") return t.errors.readOnly
  const code = error.fieldErrors?._root?.[0]
  if (code && Object.hasOwn(t.errors, code)) {
    return t.errors[code as keyof T["errors"]]
  }
  return t.errors.generic
}

/**
 * F-AC-06 §4.2 / §6 marks entry (D-304). Phone: one 72 px row per student
 * with a large numeric input; Enter moves to the next student so the keypad
 * stays up; Absent/Exempt chips in the sticky bar act on the selected row.
 * Desktop: the same rows as a grid with ↑/↓, Esc, A, E and Ctrl+S. Invalid
 * rows keep an inline error and are not sent; every valid change saves.
 */
export function MarksEntry({
  t,
  locale,
  sheet,
  readOnlyReason,
}: {
  t: T
  locale: Locale
  sheet: MarkSheet
  readOnlyReason: ReadOnlyReason | null
}) {
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(sheet.rows.map((r) => [r.studentId, fromSaved(r)]))
  )
  const [focused, setFocused] = useState<string | null>(null)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info"
    text: string
  } | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const readOnly = readOnlyReason !== null
  const full = sheet.fullMarks
  const nameOf = (r: MarkSheetRow) =>
    locale === "bn" && r.fullNameBn ? r.fullNameBn : r.fullName
  const currents = Object.fromEntries(
    sheet.rows.map((r) => {
      const row = rows[r.studentId]
      return [r.studentId, row ? currentMark(row, full) : { kind: "blank" }]
    })
  ) as Record<string, Current>
  const progress = marksProgress(
    sheet.rows.map((r) => ({
      status: currents[r.studentId]?.kind === "mark" ? "done" : null,
    }))
  )
  const dirtyIds = sheet.rows
    .map((r) => r.studentId)
    .filter((id) => {
      const row = rows[id]
      const current = currents[id]
      return row && current && isDirty(row, current)
    })

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => {
      const row = prev[id]
      return row
        ? { ...prev, [id]: { ...row, serverIssue: null, ...patch } }
        : prev
    })
    setNotice(null)
    setKey(crypto.randomUUID())
  }

  function revert(id: string) {
    const row = rows[id]
    if (!row) return
    update(id, {
      text:
        row.saved.status === "entered" && row.saved.obtained !== null
          ? String(row.saved.obtained)
          : "",
      chosen:
        row.saved.status === "absent" || row.saved.status === "exempt"
          ? row.saved.status
          : null,
    })
  }

  function focusRow(index: number) {
    const el = inputs.current[index]
    if (!el) return
    el.focus()
    el.select()
    el.scrollIntoView({ block: "center" })
  }

  function save() {
    const entries: MarkEntry[] = dirtyIds.flatMap((id) => {
      const current = currents[id]
      const row = rows[id]
      if (!row || current?.kind !== "mark") return []
      return [
        {
          studentId: id,
          status: current.status,
          obtained: current.obtained,
          expectedUpdatedAt: row.updatedAt,
        },
      ]
    })
    if (entries.length === 0) {
      setNotice({ tone: "info", text: t.nothingToSave })
      return
    }
    startTransition(async () => {
      const result = await saveMarks({
        idempotencyKey: key,
        examSubjectId: sheet.paperId,
        entries,
      })
      if (!result.ok) {
        setNotice({ tone: "error", text: saveErrorText(t, result.error) })
        return
      }
      const rejected = new Map(
        result.data.rejected.map((r) => [r.studentId, r.issue])
      )
      setRows((prev) => {
        const next = { ...prev }
        for (const m of result.data.marks) {
          const row = next[m.studentId]
          if (!row || rejected.has(m.studentId)) continue
          next[m.studentId] = {
            ...row,
            saved: { status: m.status, obtained: m.obtained },
            updatedAt: m.updatedAt,
            serverIssue: null,
          }
        }
        for (const [id, issue] of rejected) {
          const row = next[id]
          if (row) next[id] = { ...row, serverIssue: issue }
        }
        return next
      })
      setKey(crypto.randomUUID())
      setNotice(
        rejected.size === 0
          ? { tone: "success", text: t.saved }
          : {
              tone: "error",
              text: fill(t.savedSome, {
                n: result.data.saved,
                m: rejected.size,
              }),
            }
      )
    })
  }

  const focusedRow = sheet.rows.find((r) => r.studentId === focused)
  const focusedState = focused ? rows[focused] : undefined

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" className="h-11 px-2">
        <Link href={`/app/exams/${sheet.examId}`}>
          <ArrowLeftIcon aria-hidden="true" />
          {t.back}
        </Link>
      </Button>

      <header className="space-y-1">
        <p className="eyebrow">{sheet.examName}</p>
        <h1 className="text-xl font-bold tracking-tight">
          {(locale === "bn" && sheet.subjectNameBn) || sheet.subjectName} ·{" "}
          {sheet.sectionLabel}
        </h1>
        <p className="text-muted-foreground text-sm tabular-nums">
          {fill(t.outOf, { full, pass: sheet.passMarks })}
        </p>
        {!readOnly ? (
          <p className="text-muted-foreground hidden text-xs lg:block">
            {t.keysHint}
          </p>
        ) : null}
      </header>

      {readOnlyReason ? (
        <InlineAlert tone="info">{t.readOnly[readOnlyReason]}</InlineAlert>
      ) : null}

      {sheet.rows.length === 0 ? (
        readOnlyReason === "notAssigned" ? null : (
          <EmptyState title={t.noStudents} />
        )
      ) : (
        <ul className="divide-border divide-y border-y">
          {sheet.rows.map((r, index) => {
            const row = rows[r.studentId]
            const current = currents[r.studentId]
            if (!row || !current) return null
            const name = nameOf(r)
            const issue: Issue | null =
              row.serverIssue ??
              (current.kind === "error" && focused !== r.studentId
                ? current.issue
                : null)
            const errorId = `mark-${r.studentId}-error`
            return (
              <li
                key={r.studentId}
                className={cn(
                  "flex min-h-[72px] items-center gap-3 py-2",
                  focused === r.studentId && "bg-muted/50"
                )}
              >
                <span className="text-muted-foreground w-8 shrink-0 text-right text-sm tabular-nums">
                  {r.rollNumber ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  {issue ? (
                    <p id={errorId} className="text-danger text-sm">
                      {fill(t.issues[issue], { full })}
                    </p>
                  ) : null}
                </div>
                {row.chosen ? (
                  <Badge variant="outline">{t[row.chosen]}</Badge>
                ) : null}
                <Input
                  ref={(el) => {
                    inputs.current[index] = el
                  }}
                  type="text"
                  inputMode="decimal"
                  enterKeyHint={
                    index === sheet.rows.length - 1 ? "done" : "next"
                  }
                  autoComplete="off"
                  aria-label={fill(t.markLabel, {
                    name,
                    roll: r.rollNumber ?? "—",
                  })}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={issue ? errorId : undefined}
                  placeholder="—"
                  value={row.text}
                  // readOnly, not disabled, while saving: a disabled input
                  // loses focus and the phone's keypad would close.
                  readOnly={readOnly || pending}
                  onFocus={(e) => {
                    setFocused(r.studentId)
                    e.currentTarget.select()
                  }}
                  onChange={(e) =>
                    update(r.studentId, { text: e.target.value, chosen: null })
                  }
                  onKeyDown={(e) => {
                    if (readOnly) return
                    const k = e.key
                    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "s") {
                      e.preventDefault()
                      save()
                    } else if (
                      (k === "Enter" && !e.shiftKey) ||
                      k === "ArrowDown"
                    ) {
                      e.preventDefault()
                      focusRow(index + 1)
                    } else if (
                      (k === "Enter" && e.shiftKey) ||
                      k === "ArrowUp"
                    ) {
                      e.preventDefault()
                      focusRow(index - 1)
                    } else if (k === "Escape") {
                      revert(r.studentId)
                    } else if (
                      k === "a" ||
                      k === "A" ||
                      k === "e" ||
                      k === "E"
                    ) {
                      e.preventDefault()
                      update(r.studentId, {
                        text: "",
                        chosen: k.toLowerCase() === "a" ? "absent" : "exempt",
                      })
                    }
                  }}
                  className="h-14 w-24 shrink-0 text-right text-xl tabular-nums md:text-xl"
                />
              </li>
            )
          })}
        </ul>
      )}

      {!readOnly && sheet.rows.length > 0 ? (
        // Sticky above the phone's bottom nav (56px + safe area), in the thumb zone.
        <div className="bg-background sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 space-y-2 border-t py-3 lg:bottom-0">
          {notice ? (
            <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
          ) : null}
          <div className="flex min-h-11 flex-wrap items-center gap-2">
            <span className="text-muted-foreground min-w-0 truncate text-sm">
              {focusedRow
                ? fill(t.chipsFor, { name: nameOf(focusedRow) })
                : t.chipsNone}
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={focusedState?.chosen ?? ""}
              disabled={!focused || pending}
              onValueChange={(value) => {
                if (!focused) return
                update(focused, {
                  text: "",
                  chosen:
                    value === "absent" || value === "exempt" ? value : null,
                })
              }}
            >
              {(["absent", "exempt"] as const).map((v) => (
                <ToggleGroupItem
                  key={v}
                  value={v}
                  className="h-11 px-4"
                  // Keep the student's input focused so the keypad stays up.
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {t[v]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-3">
            <p
              className="min-w-0 flex-1 text-sm tabular-nums"
              aria-live="polite"
            >
              <span className="text-base font-semibold">
                {fill(t.progress, progress)}
              </span>
              <span className="sr-only">
                {" "}
                {fill(t.progressLabel, progress)}
              </span>
              {dirtyIds.length > 0 ? (
                <span className="text-muted-foreground block text-xs">
                  {fill(t.unsaved, { n: dirtyIds.length })}
                </span>
              ) : null}
            </p>
            <Button
              type="button"
              className="h-14 min-w-32 text-base"
              onClick={save}
              disabled={pending}
            >
              {pending ? t.saving : t.save}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
