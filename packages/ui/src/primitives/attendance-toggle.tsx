"use client"

import * as React from "react"

import { cn } from "../lib/utils"

import type { AttendanceStatus } from "./status-chip"

/**
 * The five-segment attendance control (DESIGN-SYSTEM §4.4, §5.1). One
 * `radiogroup`, never five separate buttons — a screen-reader user needs to
 * hear "radio group, Rahim Uddin, 5 options, Present selected", not five
 * unrelated buttons with no shared context.
 *
 * `value` includes `"unmarked"` (DECISION-LOG D-40/amended D-22): the roster's
 * default is *no* selection, not a pre-filled "present" — a default that
 * fabricates attendance poisons every downstream number. `"unmarked"` renders
 * every segment in its unselected (`--muted`) state.
 */
const STATUS_ORDER: readonly AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
  "half_day",
]

type SegmentMeta = {
  letterEn: string
  letterBn: string
  nameEn: string
  nameBn: string
  selectedClass: string
  ringClass?: string
}

const SEGMENT_META: Record<AttendanceStatus, SegmentMeta> = {
  present: {
    letterEn: "P",
    letterBn: "উ",
    nameEn: "Present",
    nameBn: "উপস্থিত",
    selectedClass: "bg-att-present text-att-present-fg",
  },
  absent: {
    letterEn: "A",
    letterBn: "অ",
    nameEn: "Absent",
    nameBn: "অনুপস্থিত",
    selectedClass: "bg-att-absent text-att-absent-fg",
  },
  late: {
    letterEn: "L",
    letterBn: "বি",
    nameEn: "Late",
    nameBn: "বিলম্বিত",
    selectedClass: "bg-att-late text-att-late-fg",
    ringClass: "ring-2 ring-att-late-ink",
  },
  excused: {
    letterEn: "E",
    letterBn: "ছু",
    nameEn: "Excused",
    nameBn: "ছুটি",
    selectedClass: "bg-att-excused text-att-excused-fg",
  },
  half_day: {
    letterEn: "½",
    letterBn: "অর্ধ",
    nameEn: "Half day",
    nameBn: "অর্ধদিবস",
    selectedClass: "bg-att-halfday text-att-halfday-fg",
    ringClass: "ring-2 ring-att-halfday-ink",
  },
}

export type AttendanceToggleValue = AttendanceStatus | "unmarked"

export type AttendanceToggleProps = {
  /** `"unmarked"` renders no segment selected (D-40). */
  value: AttendanceToggleValue
  onChange: (status: AttendanceStatus) => void
  /** Names the radiogroup: "Rahim Uddin" — read as "radiogroup, Rahim Uddin". */
  studentName: string
  locale?: "en" | "bn"
  disabled?: boolean
  className?: string
  /** F-ID-10 §5.1 (Part 3): `"basic"` bumps each segment to the 56px
   * basic-mode tap target and its letter to the 18px basic body size. Each
   * segment is already a visible glyph + `aria-label`, not an icon-only
   * button, so basic mode's "always icon and label" rule needs only the
   * size bump, not a layout change. */
  size?: "default" | "basic"
}

export function AttendanceToggle({
  value,
  onChange,
  studentName,
  locale = "en",
  disabled = false,
  className,
  size = "default",
}: AttendanceToggleProps) {
  const groupRef = React.useRef<HTMLDivElement>(null)

  const focusSegment = (index: number) => {
    const buttons =
      groupRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")
    buttons?.[index]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = STATUS_ORDER.indexOf(
      (value === "unmarked" ? STATUS_ORDER[0] : value) as AttendanceStatus
    )
    let nextIndex: number | null = null

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % STATUS_ORDER.length
        break
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex =
          (currentIndex - 1 + STATUS_ORDER.length) % STATUS_ORDER.length
        break
      case "Home":
        nextIndex = 0
        break
      case "End":
        nextIndex = STATUS_ORDER.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const next = STATUS_ORDER[nextIndex]
    if (next) {
      onChange(next)
      focusSegment(nextIndex)
    }
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={studentName}
      onKeyDown={handleKeyDown}
      className={cn(
        // §3.5: the five segments are contiguous by design and exempt from the
        // 8px adjacency rule — they form a single segmented control.
        "border-border flex overflow-hidden rounded-md border",
        className
      )}
    >
      {STATUS_ORDER.map((status, index) => {
        const meta = SEGMENT_META[status]
        const selected = value === status
        const letter = locale === "bn" ? meta.letterBn : meta.letterEn
        const name = locale === "bn" ? meta.nameBn : meta.nameEn

        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            tabIndex={
              selected || (value === "unmarked" && index === 0) ? 0 : -1
            }
            disabled={disabled}
            onClick={() => onChange(status)}
            className={cn(
              // §3.5: each segment ≥56px wide × 44px tall (basic mode: ≥56px tall too, §5.1).
              "focus-visible:ring-ring flex flex-1 items-center justify-center font-semibold outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset active:scale-[0.97]",
              size === "basic"
                ? "min-h-14 min-w-16 text-lg"
                : "min-h-11 min-w-14 text-sm",
              "[transition-duration:var(--duration-instant)]",
              selected
                ? cn(meta.selectedClass, meta.ringClass, "ring-inset")
                : "bg-muted text-muted-foreground hover:text-foreground",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <span aria-hidden="true">{letter}</span>
          </button>
        )
      })}
    </div>
  )
}

export { STATUS_ORDER as ATTENDANCE_STATUS_ORDER }
