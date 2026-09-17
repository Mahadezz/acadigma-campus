import * as React from "react"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

/**
 * One chip for every state in the product — attendance, order, payout, listing
 * review, print job. Feature code picks a *tone*, not a colour, so a status that
 * changes meaning changes in one place.
 *
 * Colour is never the only signal: the label always carries the meaning in words,
 * which is what keeps this usable at 4.5:1 contrast and for colour-blind users.
 */
const statusChipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        /** Settled, correct, paid, present. */
        positive:
          "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        /** Waiting on someone: pending review, held earnings, queued job. */
        pending:
          "border-amber-600/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        /** Failed, rejected, refunded, absent. */
        negative: "border-destructive/25 bg-destructive/10 text-destructive",
        /** In progress, informational. */
        info: "border-sky-600/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
        /** Draft, archived, cancelled — present but inactive. */
        neutral: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

export type StatusChipProps = React.ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof statusChipVariants> & {
    /** Optional leading dot or icon. Decorative — the label carries the meaning. */
    icon?: React.ReactNode
  }

export function StatusChip({
  tone,
  icon,
  className,
  children,
  ...props
}: StatusChipProps) {
  return (
    <span className={cn(statusChipVariants({ tone }), className)} {...props}>
      {icon ? (
        <span aria-hidden="true" className="[&_svg]:size-3">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}

export { statusChipVariants }
