import * as React from "react"

import { cn } from "../lib/utils"

/**
 * The frame every signed-in screen sits in (ARCHITECTURE §6).
 *
 * The phone/desktop switch is pure CSS at `lg` (1024px), not a media-query hook:
 * both layouts exist in the server HTML, so there is no flash of the wrong shell on
 * first paint and no hydration mismatch.
 *
 * ```tsx
 * <AppShell
 *   topBar={<TopBar title="Attendance" />}
 *   sidebar={<SchoolSidebar />}
 *   bottomNav={<SchoolBottomNav />}
 * >
 *   {children}
 * </AppShell>
 * ```
 */
export type AppShellProps = {
  /** Sticky header. Shown at every width. */
  topBar?: React.ReactNode
  /** Desktop-only rail, from `lg` up. */
  sidebar?: React.ReactNode
  /** Phone-only tab bar, below `lg`. */
  bottomNav?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AppShell({
  topBar,
  sidebar,
  bottomNav,
  children,
  className,
}: AppShellProps) {
  return (
    <div
      className={cn(
        "bg-background text-foreground min-h-dvh",
        // Room for the fixed sidebar on desktop.
        sidebar && "lg:grid lg:grid-cols-[16rem_1fr]",
        className
      )}
    >
      {sidebar ? (
        <aside
          className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-dvh border-r lg:block"
          aria-label="Main navigation"
        >
          {sidebar}
        </aside>
      ) : null}

      <div className="flex min-h-dvh min-w-0 flex-col">
        {topBar}

        <main
          id="main"
          className={cn(
            "flex-1 px-4 py-4 sm:px-6 lg:px-8",
            // Keep the last row of content clear of the fixed tab bar.
            bottomNav && "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-8"
          )}
        >
          {children}
        </main>

        {bottomNav}
      </div>
    </div>
  )
}

/**
 * Skip link. Rendered first inside `<body>` so keyboard and screen-reader users can
 * jump past the nav to `#main`, which AppShell provides.
 */
export function SkipToContent({
  label = "Skip to content",
}: {
  label?: string
}) {
  return (
    <a
      href="#main"
      className="bg-background text-foreground ring-ring sr-only z-50 rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-2"
    >
      {label}
    </a>
  )
}
