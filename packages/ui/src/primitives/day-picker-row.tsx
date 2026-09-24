"use client"

import * as React from "react"

import { cn } from "../lib/utils"

/**
 * F-ID-05 §4.3 Step 2 / §6: the seven-day working-week picker. "the
 * day-chip row is a labelled checkbox group" (§6 a11y) — a `fieldset` +
 * `legend` wrapping seven `role="checkbox"` chips, 44px tall, wrapping to
 * two lines at 360px (`flex-wrap`). Arrow-left/right moves focus between
 * chips without changing their checked state, matching the a11y note
 * "operable with arrow keys".
 *
 * Callers pass `options` already in the order they should render — the
 * wizard passes the Sat-first order (§4.2: "starting Saturday").
 */
export type DayPickerRowOption = {
  value: number
  /** Short label rendered on the chip itself, e.g. "Sat". */
  label: React.ReactNode
  /** Full day name for the accessible name, e.g. "Saturday". */
  fullLabel: string
}

export type DayPickerRowProps = {
  legend: string
  options: readonly DayPickerRowOption[]
  value: number[]
  onChange: (value: number[]) => void
  className?: string
}

export function DayPickerRow({
  legend,
  options,
  value,
  onChange,
  className,
}: DayPickerRowProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  function toggle(day: number) {
    onChange(
      value.includes(day) ? value.filter((d) => d !== day) : [...value, day]
    )
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const delta = event.key === "ArrowRight" ? 1 : -1
    const next = (index + delta + options.length) % options.length
    refs.current[next]?.focus()
  }

  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)}>
      <legend className="text-foreground mb-2 p-0 text-sm font-medium">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const checked = value.includes(option.value)
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-label={option.fullLabel}
              onClick={() => toggle(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-semibold transition-colors",
                "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/5"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
