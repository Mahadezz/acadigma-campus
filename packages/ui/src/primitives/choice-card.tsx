import * as React from "react"

import { ChevronRightIcon } from "lucide-react"

import { cn } from "../lib/utils"

/**
 * F-ID-05 §4.2/§6: the onboarding chooser's two options — "Create a school"
 * and "Join a school". Icon, title, one description line, ≥120px tall (§6
 * wireframe: "each 120 px tall"), fully within thumb reach, never a
 * carousel. Renders an `<a>` when `href` is given (the chooser's normal
 * case — real navigation, works without JS), a `<button>` when `onClick` is
 * given instead (the tutoring exit link's sibling affordance, which runs a
 * server action before navigating), or a non-interactive `<div
 * aria-disabled>` when `disabled` is set — used for a card whose
 * destination does not exist yet (Opus review, PR #24: a disabled card with
 * a "Coming soon" `badge`, not a link that 404s).
 *
 * Plain `<a>`, not `next/link` (Opus review, PR #24): `packages/ui` has no
 * `next` dependency and no primitive here uses `next/link` anywhere — a
 * deliberate, existing, framework-agnostic boundary this component follows
 * rather than breaks. Losing client-side prefetch on this one card is a
 * smaller cost than being the first primitive in the package to need a
 * link-component prop for it.
 */
export type ChoiceCardProps = {
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  href?: string
  onClick?: () => void
  disabled?: boolean
  /** Shown next to the title, only while `disabled` — e.g. "Coming soon". */
  badge?: React.ReactNode
  className?: string
}

export function ChoiceCard({
  icon,
  title,
  description,
  href,
  onClick,
  disabled,
  badge,
  className,
}: ChoiceCardProps) {
  const content = (
    <>
      <span
        className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full [&_svg]:size-5"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-foreground block text-base font-semibold">
            {title}
          </span>
          {disabled && badge ? (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground block text-sm text-balance">
          {description}
        </span>
      </span>
      {disabled ? null : (
        <ChevronRightIcon
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden="true"
        />
      )}
    </>
  )

  const shared = cn(
    "flex min-h-[120px] w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-flat transition-colors",
    disabled ? "cursor-not-allowed opacity-60" : "hover:bg-accent/5",
    "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2",
    className
  )

  if (disabled) {
    return (
      <div className={shared} aria-disabled="true">
        {content}
      </div>
    )
  }

  if (href) {
    return (
      <a href={href} className={shared}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={shared}>
      {content}
    </button>
  )
}
