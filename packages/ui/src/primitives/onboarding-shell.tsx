import * as React from "react"

import { ChevronLeftIcon } from "lucide-react"

import { cn } from "../lib/utils"

import { Logo } from "./logo"

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
 * This component forwards a ref to that `<h1>` (a `tabIndex={-1}` heading,
 * not natively focusable otherwise) for exactly that purpose; a caller
 * moves focus itself, typically from a `useEffect` that fires when its own
 * step component mounts (React 19 attaches this ref as a plain prop —
 * `forwardRef` is not required, but is kept for compatibility with any
 * caller still on an older React types version within this monorepo).
 *
 * The back link is a plain `<a>`, not `next/link` — see `choice-card.tsx`'s
 * docblock for why (Opus review, PR #24): no primitive in this
 * `next`-dependency-free package uses it.
 *
 * `onBack` (F-ID-05 Part 3): the create-school wizard's steps are one
 * client component's local state, not separate routes (§4.3: draft saves
 * on advance, not a URL change per step) — "Back" from step 2 to step 1
 * has nothing to navigate to, so it takes a click handler instead of an
 * href. Wins over `backHref` when both are given (a step screen that also
 * happens to be step 1 passes `backHref` alone, back to the chooser).
 */
export type OnboardingShellProps = {
  title?: React.ReactNode
  /** Omitted on the chooser, which has no step to show. */
  progress?: { current: number; total: number }
  /** Localised accessible name for the progress bar (defaults to English). */
  progressLabel?: string
  backHref?: string
  onBack?: () => void
  backLabel?: string
  /** Rendered top-right — e.g. the account menu (§6, chooser row). */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export const OnboardingShell = React.forwardRef<
  HTMLHeadingElement,
  OnboardingShellProps
>(function OnboardingShell(
  {
    title,
    progress,
    progressLabel,
    backHref,
    onBack,
    backLabel = "Back",
    actions,
    children,
    className,
  },
  ref
) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-col px-4 pt-5 pb-10 sm:px-6 lg:max-w-3xl",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 pb-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
            {backLabel}
          </button>
        ) : backHref ? (
          <a
            href={backHref}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
            {backLabel}
          </a>
        ) : (
          <Logo product="campus" />
        )}
        {actions}
      </header>

      {progress ? (
        <div
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={1}
          aria-valuemax={progress.total}
          aria-label={
            progressLabel ?? `Step ${progress.current} of ${progress.total}`
          }
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

      {progress ? (
        // D-68 eyebrow: the step count as digits, so it needs no copy in
        // either locale; hidden from AT because the progressbar above
        // already announces it.
        <p className="eyebrow mb-2" aria-hidden="true">
          {String(progress.current).padStart(2, "0")} /{" "}
          {String(progress.total).padStart(2, "0")}
        </p>
      ) : null}

      {title ? (
        <h1
          ref={ref}
          tabIndex={-1}
          className="mb-6 text-2xl font-medium tracking-tight outline-none sm:text-3xl"
        >
          {title}
        </h1>
      ) : null}

      <div className="flex-1">{children}</div>
    </div>
  )
})
