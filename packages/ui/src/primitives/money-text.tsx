import * as React from "react"

import { formatTaka, type Paisa } from "@acadigma/domain/money"

import { cn } from "../lib/utils"

/**
 * Renders an amount. The prop is paisa, never taka, because that is what the API
 * returns and what the database stores (ARCHITECTURE §4) — taking a float here would
 * reintroduce the rounding the whole money module exists to prevent.
 *
 * Tabular numerals keep columns of amounts aligned on their decimal point.
 */
export type MoneyTextProps = React.ComponentPropsWithoutRef<"span"> & {
  /** Whole paisa. 123456 renders as ৳1,234.56. */
  paisa: Paisa
  /** Drop `.00` on whole-taka amounts — good for headline figures, not invoices. */
  compact?: boolean
  /** Tint negative amounts (refunds, adjustments) so they read as outgoing. */
  signed?: boolean
}

export function MoneyText({
  paisa,
  compact = false,
  signed = false,
  className,
  ...props
}: MoneyTextProps) {
  const formatted = formatTaka(paisa, { compactWholeTaka: compact })

  return (
    <span
      className={cn(
        "tabular-nums",
        signed && paisa < 0 && "text-destructive",
        className
      )}
      {...props}
    >
      {formatted}
    </span>
  )
}
