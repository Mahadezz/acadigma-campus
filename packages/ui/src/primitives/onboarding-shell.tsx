import * as React from "react"

import { ChevronLeftIcon } from "lucide-react"

import { cn } from "../lib/utils"

/**
 * F-ID-05 §6: the frame every onboarding screen renders inside — the
 * chooser (Part 2) and the create-school wizard's five steps (Parts 3-4),
 * which is why `progress` and `backHref` are both optional: the chooser has
 * neither. Phone-first at 360×800; from `sm` the wizard steps render inside
 * a 640px card with a step rail (§4.3) — that rail is the wizard's own
 * concern and composes around this shell rather than inside it.
 *
 * A11y (§6): the progress bar is `role="progressbar"` with `aria-valuenow`,
 * and each step's `<h1>` (rendered here) is where focus should land on
 * navigation — the page component is responsible for moving focus to it,
 * since only it knows when a client-side step transition just happened.
 *
 * The back link is a plain `<a>`, not `next/link` — see `choice-card.tsx`'s
 * docblock for why (Opus review, PR #24): no primitive in this
 * `next`-dependency-free package uses it.
 */
export type OnboardingShellProps = {
  title?: React.ReactNode
  /** Omitted on the chooser, which has no step to show. */
  progress?: { current: number; total: number }
  backHref?: string
  backLabel?: string
  /** Rendered top-right — e.g. the account menu (§6, chooser row). */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function OnboardingShell({
  title,
  progress,
  backHref,
  backLabel = "Back",
  actions,
  children,
  className,
}: OnboardingShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-col px-4 pt-5 pb-10 sm:px-6 lg:max-w-3xl",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 pb-4">
        {backHref ? (
          <a
            href={backHref}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
            {backLabel}
          </a>
        ) : (
          <span className="text-sm font-semibold tracking-tight">
            Acadigma Campus
          </span>
        )}
        {actions}
      </header>

      {progress ? (
        <div
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={1}
          aria-valuemax={progress.total}
          aria-label={`Step ${progress.current} of ${progress.total}`}
          className="bg-muted mb-6 h-1.5 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width]"
            style={{
              width: `${(progress.current / progress.total) * 100}%`,
            }}
          />
        </div>
      ) : null}

      {title ? (
        <h1 className="mb-6 text-xl font-bold tracking-tight sm:text-2xl">
          {title}
        </h1>
      ) : null}

      <div className="flex-1">{children}</div>
    </div>
  )
}
