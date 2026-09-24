"use client"

import * as React from "react"

import { cn } from "../lib/utils"

import { resolveNavIcon } from "./bottom-nav"
import { useFilteredNav } from "./nav-config"

import type { NavLinkRenderer } from "./bottom-nav"
import type { NavConfig, NavFilterContext, NavItem } from "./nav-config"

/**
 * Desktop rail (DESIGN-SYSTEM §3.1 "Desktop ≥ 1024"): the paper/chalk
 * `Sidebar` with ink text (D-57; was an inverted navy surface), carrying the
 * **full** nav — "More" disappears entirely once there is no space
 * constraint, so every `more` group renders inline instead of behind a
 * sheet. Same `NavConfig`, same `filterNav` gating as `BottomNavFromConfig`
 * (§3.1 "Same nav config object, different renderer") — the two never see a
 * different set of items for the same role/plan. Purely token-driven
 * (`bg-sidebar`, `bg-sidebar-accent`, `text-sidebar-accent-foreground`) —
 * no colour is hard-coded here, so the D-57 token change alone restyles it.
 */
export function SidebarFromConfig({
  config,
  filter,
  pathname,
  renderLink,
  locale = "en",
  title,
  navLabel = "Main",
  className,
}: {
  config: NavConfig
  filter: NavFilterContext
  pathname: string
  renderLink: NavLinkRenderer
  locale?: "en" | "bn"
  /** Rendered above the nav, e.g. the product name. */
  title?: React.ReactNode
  /** Names the landmark, matching `BottomNavFromConfig`'s `navLabel` so a
   * consumer's test can find "the nav" by the same accessible name on both
   * viewports. */
  navLabel?: string
  className?: string
}) {
  const filtered = useFilteredNav(config, filter)
  const isActive = React.useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  )

  return (
    <nav
      aria-label={navLabel}
      className={cn(
        "flex h-full flex-col gap-1 overflow-y-auto p-3",
        className
      )}
    >
      {title ? (
        <p className="px-3 py-2 text-sm font-semibold tracking-tight">
          {title}
        </p>
      ) : null}

      <SidebarItemList
        items={filtered.bottom}
        isActive={isActive}
        locale={locale}
        renderLink={renderLink}
      />

      {filtered.more.map((group) => (
        <div key={group.id} className="mt-3 flex flex-col gap-0.5">
          <h3 className="text-muted-foreground px-3 py-1.5 text-xs font-semibold tracking-wide uppercase">
            {locale === "bn" ? group.labelBn : group.labelEn}
          </h3>
          <SidebarItemList
            items={group.items}
            isActive={isActive}
            locale={locale}
            renderLink={renderLink}
          />
        </div>
      ))}
    </nav>
  )
}

function SidebarItemList({
  items,
  isActive,
  locale,
  renderLink,
}: {
  items: readonly NavItem[]
  isActive: (href: string) => boolean
  locale: "en" | "bn"
  renderLink: NavLinkRenderer
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((navItem) => {
        const Icon = resolveNavIcon(navItem.icon)
        const active = isActive(navItem.href)
        const label = locale === "bn" ? navItem.labelBn : navItem.labelEn
        const badgeCount = navItem.badge?.count

        return (
          <React.Fragment key={navItem.id}>
            {renderLink({
              href: navItem.href,
              label,
              active,
              className: cn(
                "focus-visible:ring-ring flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              ),
              children: (
                <>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  {badgeCount ? (
                    <span
                      className="bg-destructive text-background ml-auto min-w-4 rounded-full px-1 text-center text-[0.625rem] leading-4 font-semibold"
                      aria-label={`${badgeCount} unread`}
                    >
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  ) : null}
                </>
              ),
            })}
          </React.Fragment>
        )
      })}
    </div>
  )
}
