"use client"

import * as React from "react"

import { cn } from "../lib/utils"

/**
 * F-ID-05 §6: a small mutually-exclusive choice rendered as a row of
 * buttons rather than a `<select>` — the wizard's step 1 "school
 * type/medium" (four options, §4.3) is the first caller. `role="radiogroup"`
 * over a native `<input type="radio">` set because the visual (a filled
 * pill, not a dot) is what the design calls for; keyboard behaviour still
 * matches a radio group — Tab enters/leaves the group, arrow keys move the
 * selection.
 */
export type SegmentedControlOption<T extends string> = {
  value: T
  label: React.ReactNode
}

export type SegmentedControlProps<T extends string> = {
  label: string
  options: readonly SegmentedControlOption<T>[]
  value?: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const delta = event.key === "ArrowRight" ? 1 : -1
    const next = (index + delta + options.length) % options.length
    refs.current[next]?.focus()
    onChange(options[next]!.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || value === undefined ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/5"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
