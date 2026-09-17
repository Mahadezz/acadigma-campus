"use client"

import * as React from "react"
import type { ComponentProps } from "react"

import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { cn } from "../lib/utils"

/**
 * A password `Input` with a show/hide toggle and an optional strength meter
 * (F-ID-01 §6: "PasswordField (with strength meter)"). The score (0-4) is
 * computed by the caller from `@acadigma/domain/auth` `scorePassword` — this
 * component stays presentational, matching HANDBOOK §8 ("packages/domain is
 * pure, packages/ui renders").
 *
 * "the password strength meter is announced as text not colour alone"
 * (F-ID-01 §6 accessibility): the label under the bar is real text, not a
 * colour-only signal.
 */
export type PasswordFieldStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
}

export type PasswordFieldProps = Omit<ComponentProps<typeof Input>, "type"> & {
  strength?: PasswordFieldStrength
  strengthMeterLabel?: string
  showPasswordLabel?: string
  hidePasswordLabel?: string
}

const SCORE_TONE = [
  "bg-danger",
  "bg-danger",
  "bg-warning",
  "bg-success",
  "bg-success",
] as const

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  PasswordFieldProps
>(function PasswordField(
  {
    strength,
    strengthMeterLabel = "Password strength",
    showPasswordLabel = "Show password",
    hidePasswordLabel = "Hide password",
    className,
    ...inputProps
  },
  ref
) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...inputProps}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hidePasswordLabel : showPasswordLabel}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? (
            <EyeOffIcon aria-hidden="true" />
          ) : (
            <EyeIcon aria-hidden="true" />
          )}
        </Button>
      </div>
      {strength ? (
        <div className="space-y-1">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                SCORE_TONE[strength.score]
              )}
              style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
            />
          </div>
          {/* Text label, not colour alone (F-ID-01 §6 accessibility). */}
          <p className="text-xs text-muted-foreground">
            {strengthMeterLabel}:{" "}
            <span className="font-medium">{strength.label}</span>
          </p>
        </div>
      ) : null}
    </div>
  )
})
