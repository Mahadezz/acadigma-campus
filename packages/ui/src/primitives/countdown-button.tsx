"use client"

import * as React from "react"
import type { ComponentProps } from "react"

import { Button } from "../components/ui/button"

/**
 * A resend/retry button that disables itself for `seconds` and counts down out
 * loud — the "visible countdown" F-ID-01 §5 requires for every resend cooldown
 * and for the rate-limit lockout message (§4.2 AC6).
 *
 * The countdown text is announced via `aria-live="polite"` on the wrapper so a
 * screen-reader user hears the button become available again, without a live
 * region firing on every single tick (that lives on the wrapper, not the button).
 */
export type CountdownButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children"
> & {
  /** Seconds remaining before the action can run again. 0 (or less) means enabled now. */
  seconds: number
  /** Label while counting down, e.g. `(s) => \`Resend in ${s}s\`` . */
  countingLabel: (secondsLeft: number) => React.ReactNode
  /** Label once the cooldown has elapsed. */
  readyLabel: React.ReactNode
}

export function CountdownButton({
  seconds,
  countingLabel,
  readyLabel,
  disabled,
  ...buttonProps
}: CountdownButtonProps) {
  const [secondsLeft, setSecondsLeft] = React.useState(Math.max(0, seconds))
  // "Adjusting state when a prop changes" — react.dev's documented alternative to
  // an effect for this exact case: setState during render, guarded so it only
  // fires the one time `seconds` actually changes, not on every tick.
  const [trackedSeconds, setTrackedSeconds] = React.useState(seconds)
  if (seconds !== trackedSeconds) {
    setTrackedSeconds(seconds)
    setSecondsLeft(Math.max(0, seconds))
  }

  React.useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearTimeout(id)
  }, [secondsLeft])

  const isCounting = secondsLeft > 0

  return (
    <div aria-live="polite">
      <Button {...buttonProps} disabled={isCounting || disabled}>
        {isCounting ? countingLabel(secondsLeft) : readyLabel}
      </Button>
    </div>
  )
}
