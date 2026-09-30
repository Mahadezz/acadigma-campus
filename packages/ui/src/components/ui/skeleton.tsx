import { cn } from "../../lib/utils"

/**
 * app-polish (D-408): `bg-foreground/10` (not a literal `bg-accent`) so the
 * fill reads at a consistent, theme-correct tone whatever surface it sits
 * on — a plain --card, or a translucent glass-panel/glass-chrome, where a
 * flat `--accent` token would either vanish or clash with the blur behind
 * it. `motion-safe:animate-pulse` is explicit here (on top of the global
 * `prefers-reduced-motion` block in tokens.css, which already zeroes every
 * transition/animation duration) so a static fill is the obvious intent,
 * not an accident of the global override.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "motion-safe:animate-pulse rounded-md bg-foreground/10",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
