import * as React from "react"

import { ChevronRightIcon } from "lucide-react"

import { cn } from "../lib/utils"

/**
 * F-ID-05 §4.2/§6: the onboarding chooser's two options — "Create a school"
 * and "Join a school". Icon, title, one description line, ≥120px tall (§6
 * wireframe: "each 120 px tall"), fully within thumb reach, never a
 * carousel. Renders an `<a>` when `href` is given (the chooser's normal
 * case — real navigation, works without JS) or a `<button>` when `onClick`
 * is given instead (the tutoring exit link's sibling affordance, which runs
 * a server action before navigating).
 */
export type ChoiceCardProps = {
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  href?: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}

export function ChoiceCard({
  icon,
  title,
  description,
  href,
  onClick,
  disabled,
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
        <span className="text-foreground block text-base font-semibold">
          {title}
        </span>
        <span className="text-muted-foreground block text-sm text-balance">
          {description}
        </span>
      </span>
      <ChevronRightIcon
        className="text-muted-foreground size-5 shrink-0"
        aria-hidden="true"
      />
    </>
  )

  const shared = cn(
    "flex min-h-[120px] w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-flat transition-colors",
    "hover:bg-accent/5",
    "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2",
    "disabled:pointer-events-none disabled:opacity-50",
    className
  )

  if (href) {
    return (
      <a href={href} className={shared}>
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={shared}
    >
      {content}
    </button>
  )
}
