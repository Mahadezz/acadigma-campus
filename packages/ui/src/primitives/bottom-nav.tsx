import * as React from "react"

import { Slot } from "radix-ui"

import { cn } from "../lib/utils"

/**
 * Phone tab bar (ARCHITECTURE §6). Hidden from `lg` up, where the sidebar takes over.
 *
 * Five items is the ceiling: past that, thumb targets get too narrow to hit. A role
 * with more destinations puts the remainder behind a "More" item that opens a Sheet.
 *
 * Routing stays in the app: `asChild` hands the rendered content to whatever link
 * component the consumer passes, so this package never depends on `next`.
 *
 * ```tsx
 * <BottomNav>
 *   <BottomNavItem asChild active={pathname === "/app/dashboard"}
 *     icon={<HomeIcon />} label="Home">
 *     <Link href="/app/dashboard" />
 *   </BottomNavItem>
 * </BottomNav>
 * ```
 */
export const BOTTOM_NAV_MAX_ITEMS = 5

export function BottomNav({
  children,
  className,
  label = "Main",
}: {
  children: React.ReactNode
  className?: string
  /** Names the landmark when a screen has more than one navigation region. */
  label?: string
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "bg-background/95 border-border supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden",
        className
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-around">{children}</ul>
    </nav>
  )
}

export type BottomNavItemProps = {
  icon: React.ReactNode
  label: string
  /** Marks the current destination for both styling and assistive tech. */
  active?: boolean
  /** Unread count. Anything above 9 renders as "9+". */
  badge?: number
  /** Render the consumer's link component instead of an `<a>`. */
  asChild?: boolean
  className?: string
} & React.ComponentPropsWithoutRef<"a">

export function BottomNavItem({
  icon,
  label,
  active = false,
  badge,
  asChild = false,
  className,
  ...props
}: BottomNavItemProps) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <li className="flex-1">
      <Comp
        // `page` is the correct value for a nav item pointing at the current screen.
        aria-current={active ? "page" : undefined}
        className={cn(
          // 44px minimum touch target, per ARCHITECTURE §6.
          "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem] font-medium",
          "focus-visible:ring-ring transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
          active
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
          className
        )}
        {...props}
      >
        <span className="relative flex size-6 items-center justify-center [&_svg]:size-5">
          {icon}
          {badge && badge > 0 ? (
            <span
              className="bg-destructive text-background absolute -top-1 -right-2 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold"
              aria-label={`${badge} unread`}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </span>
        <span className="max-w-full truncate">{label}</span>
      </Comp>
    </li>
  )
}
