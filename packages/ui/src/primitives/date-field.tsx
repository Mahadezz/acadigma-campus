import * as React from "react"

import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { cn } from "../lib/utils"

/**
 * F-ID-05 §4.3 Step 2: the two academic-year date fields. Native
 * `<input type="date">` — the platform's own date picker is already
 * accessible and keyboard-operable, so there is no reason to ship a custom
 * calendar widget for a plain calendar-date field (ponytail: native
 * platform feature over a picker library).
 */
export type DateFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  helperText?: React.ReactNode
  errorText?: React.ReactNode
  className?: string
}

export function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  helperText,
  errorText,
  className,
}: DateFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errorText ? true : undefined}
        aria-describedby={
          errorText ? `${id}-error` : helperText ? `${id}-helper` : undefined
        }
      />
      {errorText ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {errorText}
        </p>
      ) : helperText ? (
        <p id={`${id}-helper`} className="text-muted-foreground text-xs">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
