import * as React from "react"

import { cn } from "../lib/utils"

/**
 * Sticky header: workspace switcher and back button on the left, the screen title in
 * the middle, notifications and overflow on the right (DESIGN-SYSTEM §3.1).
 *
 * The title is an `<h1>`, so every screen has exactly one — the landmark structure
 * axe checks for in the e2e suite. Padded for `env(safe-area-inset-top)` so the
 * bar clears the notch/status bar in the installed PWA, and uses `--z-topbar`
 * so it stacks correctly under sheets/dialogs/the offline banner (§2.8).
 *
 * Sticky, not fixed (§3.1): it scrolls away on long reading pages and is kept
 * on screen only by pages that also pass a persistent `fixed` wrapper — that
 * choice belongs to the page, not this component.
 */
export type TopBarProps = {
  title: React.ReactNode
  /** Small line under the title: class name, date, workspace. */
  subtitle?: React.ReactNode
  /** Back button or workspace switcher. */
  leading?: React.ReactNode
  /** Notifications, search, overflow menu. Keep to three targets on a phone. */
  actions?: React.ReactNode
  className?: string
}

export function TopBar({
  title,
  subtitle,
  leading,
  actions,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "bg-background/95 border-border supports-[backdrop-filter]:bg-background/75 sticky top-0 z-[var(--z-topbar)] border-b backdrop-blur",
        className
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
        {leading ? (
          <div className="flex shrink-0 items-center">{leading}</div>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base leading-tight font-medium tracking-tight sm:text-lg">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
