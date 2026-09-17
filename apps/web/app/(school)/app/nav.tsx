"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  CalendarDaysIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  LayoutDashboardIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import {
  can,
  type Action,
  type WorkspaceRole,
} from "@acadigma/domain/permissions"
import { cn } from "@acadigma/ui/lib/utils"
import {
  BOTTOM_NAV_MAX_ITEMS,
  BottomNav,
  BottomNavItem,
} from "@acadigma/ui/primitives/bottom-nav"

type NavEntry = {
  href: string
  label: string
  icon: LucideIcon
  /** Hidden unless the role holds this action (ARCHITECTURE §6). */
  requires?: Action
}

/**
 * One nav config for the school workspace, filtered by role. Adding a screen means
 * adding a line here — never a conditional scattered through a layout.
 */
const SCHOOL_NAV: readonly NavEntry[] = [
  { href: "/app/dashboard", label: "Home", icon: LayoutDashboardIcon },
  {
    href: "/app/attendance",
    label: "Attendance",
    icon: ClipboardCheckIcon,
    requires: "attendance.read",
  },
  {
    href: "/app/timetable",
    label: "Timetable",
    icon: CalendarDaysIcon,
    requires: "timetable.read",
  },
  {
    href: "/app/students",
    label: "Students",
    icon: UsersIcon,
    requires: "students.read",
  },
  { href: "/app/more", label: "More", icon: EllipsisIcon },
]

function visibleFor(role: WorkspaceRole): NavEntry[] {
  return SCHOOL_NAV.filter(
    (entry) => !entry.requires || can(role, entry.requires)
  ).slice(0, BOTTOM_NAV_MAX_ITEMS)
}

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`)
}

/** Phone tab bar. Hidden from `lg` up, where SchoolSidebar takes over. */
export function SchoolBottomNav({ role }: { role: WorkspaceRole }) {
  const isActive = useIsActive()

  return (
    <BottomNav label="School">
      {visibleFor(role).map(({ href, label, icon: Icon }) => (
        <BottomNavItem
          key={href}
          asChild
          active={isActive(href)}
          icon={<Icon />}
          label={label}
        >
          <Link href={href} />
        </BottomNavItem>
      ))}
    </BottomNav>
  )
}

/** Desktop rail. The same entries, laid out vertically. */
export function SchoolSidebar({ role }: { role: WorkspaceRole }) {
  const isActive = useIsActive()

  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <p className="px-3 py-2 text-sm font-semibold tracking-tight">
        Acadigma Campus
      </p>
      <nav className="flex flex-col gap-0.5">
        {visibleFor(role).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors",
              "focus-visible:ring-ring outline-none focus-visible:ring-2",
              isActive(href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
