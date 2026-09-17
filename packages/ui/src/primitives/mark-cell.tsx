"use client"

import * as React from "react"

import { cn } from "../lib/utils"

/**
 * Controlled numeric cell for the marks-entry grid (DESIGN-SYSTEM §4.5, §5.2).
 * `inputMode="decimal"` and `enterKeyHint="next"` so the OS shows a numeric pad
 * on phone; on desktop, focus lands with the value selected so typing replaces
 * rather than appends — the whole point of the keyboard-first contract.
 *
 * Out-of-range values raise a `--danger` ring and a tooltip naming the max
 * **without blocking typing** — the teacher can keep typing past a mis-entered
 * digit rather than fighting an input that eats keystrokes. Clamping to
 * `[0, maxMarks]` happens only at commit (blur or Enter), which is also when
 * `onCommit` fires.
 *
 * Grade-band boundaries are per-school data (`grade_scales`), so this
 * component never computes a grade itself — it renders whatever `getGrade`
 * returns, in the matching `--grade-X` tint.
 */

export type GradeBand = "a-plus" | "a" | "a-minus" | "b" | "c" | "d" | "f"

export type MarkCellGrade = { band: GradeBand; label: string }

const GRADE_CLASS: Record<GradeBand, string> = {
  "a-plus": "bg-grade-a-plus text-grade-ink",
  a: "bg-grade-a text-grade-ink",
  "a-minus": "bg-grade-a-minus text-grade-ink",
  b: "bg-grade-b text-grade-ink",
  c: "bg-grade-c text-grade-ink",
  d: "bg-grade-d text-grade-ink",
  f: "bg-grade-f text-grade-ink",
}

export type MarkCellProps = {
  /** `null` means "not entered". */
  value: number | null
  /** Fires on blur or Enter with the clamped value (or `null` if cleared). */
  onCommit: (value: number | null) => void
  maxMarks: number
  /** Grade bands are per-school data; the grid supplies the lookup. */
  getGrade?: (value: number, maxMarks: number) => MarkCellGrade | undefined
  /** `Enter` commits and asks the grid to advance — the grid owns focus movement. */
  onNext?: () => void
  "aria-label"?: string
  disabled?: boolean
  className?: string
}

export function MarkCell({
  value,
  onCommit,
  maxMarks,
  getGrade,
  onNext,
  disabled = false,
  className,
  ...aria
}: MarkCellProps) {
  const [raw, setRaw] = React.useState(value === null ? "" : String(value))
  const [isEditing, setIsEditing] = React.useState(false)
  // Tracks the last `value` this cell has rendered a display string for, so an
  // externally-changed value (the server's canonical row coming back, a reset)
  // can update `raw` — but never while the teacher is mid-keystroke. This is
  // the render-time "adjust state when a prop changes" pattern, not an effect:
  // an effect would set state a beat late and flash the stale digits first.
  const [lastSeenValue, setLastSeenValue] = React.useState(value)
  if (value !== lastSeenValue && !isEditing) {
    setLastSeenValue(value)
    setRaw(value === null ? "" : String(value))
  }

  const parsed = raw.trim() === "" ? null : Number(raw)
  const isValidNumber = parsed === null || Number.isFinite(parsed)
  const isOutOfRange =
    parsed !== null && isValidNumber && (parsed < 0 || parsed > maxMarks)

  const commit = () => {
    setIsEditing(false)
    if (raw.trim() === "") {
      onCommit(null)
      return
    }
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) {
      setRaw(value === null ? "" : String(value))
      return
    }
    const clamped = Math.min(Math.max(numeric, 0), maxMarks)
    setRaw(String(clamped))
    onCommit(clamped)
  }

  const grade =
    parsed !== null && isValidNumber && !isOutOfRange
      ? getGrade?.(parsed, maxMarks)
      : undefined

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        disabled={disabled}
        value={raw}
        aria-label={aria["aria-label"]}
        aria-invalid={isOutOfRange || undefined}
        title={isOutOfRange ? `Maximum ${maxMarks}` : undefined}
        onFocus={(event) => {
          setIsEditing(true)
          event.currentTarget.select()
        }}
        onChange={(event) => setRaw(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setRaw(value === null ? "" : String(value))
            setIsEditing(false)
            event.currentTarget.blur()
            return
          }
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
            onNext?.()
          }
        }}
        className={cn(
          "border-input bg-background h-11 w-16 rounded-md border px-2 text-right text-sm tabular-nums outline-none",
          "focus-visible:ring-ring focus-visible:ring-2",
          isOutOfRange && "border-danger ring-danger ring-1"
        )}
      />
      <span className="text-muted-foreground text-xs tabular-nums">
        /{maxMarks}
      </span>
      {grade ? (
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-xs font-semibold",
            GRADE_CLASS[grade.band]
          )}
        >
          {grade.label}
        </span>
      ) : null}
    </div>
  )
}
