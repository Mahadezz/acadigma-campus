"use client"

import * as React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { NavConfig, NavModuleKey } from "@acadigma/domain/nav"
import type { WorkspaceRole } from "@acadigma/domain/permissions"
import {
  BottomNavFromConfig,
  type NavLinkRenderer,
} from "@acadigma/ui/primitives/bottom-nav"
import type { NavFilterContext } from "@acadigma/ui/primitives/nav-config"
import { SidebarFromConfig } from "@acadigma/ui/primitives/sidebar-from-config"

import type { Locale } from "@/lib/locale"

/**
 * The school workspace's nav (DESIGN-SYSTEM §3.2), wired into the single nav
 * system in `@acadigma/domain/nav` (D-56) — this file used to hand-roll its
 * own `SCHOOL_NAV` list and `can()` filter, entirely separate from both the
 * domain nav engine and `packages/ui`'s curated trees. `SchoolLayout` (server
 * component, `layout.tsx`) resolves `role` from `requireWorkspace()` and the
 * entitled module set from the plans engine, and picks the curated tree with
 * `getNavConfig(workspaceType, role)`; this file only adds the two things
 * that must run on the client — `usePathname()` and the `next/link` renderer
 * — and renders both `BottomNavFromConfig` (phone) and `SidebarFromConfig`
 * (desktop) off the exact same filtered tree (§3.1 "Same nav config object,
 * different renderer").
 *
 * `locale` threads through to both renderers, which already know how to pick
 * `labelBn`/`labelEn` off each `NavItem` (`@acadigma/domain/nav`'s config
 * data, not the `messages/*.json` catalogue) — before this Part neither
 * component received it, so the school shell's nav stayed English even after
 * a user switched the rest of the app to বাংলা.
 */

const renderLink: NavLinkRenderer = ({
  href,
  className,
  active,
  children,
  onNavigate,
}) => (
  <Link
    href={href}
    className={className}
    aria-current={active ? "page" : undefined}
    onClick={onNavigate}
  >
    {children}
  </Link>
)

function useSchoolNavFilter(
  role: WorkspaceRole,
  entitledModules: readonly NavModuleKey[]
): NavFilterContext {
  const moduleSet = React.useMemo(
    () => new Set(entitledModules),
    [entitledModules]
  )
  return React.useMemo(
    () => ({
      role,
      hasModule: (module: NavModuleKey) => moduleSet.has(module),
    }),
    [role, moduleSet]
  )
}

export type SchoolNavProps = {
  config: NavConfig
  role: WorkspaceRole
  entitledModules: readonly NavModuleKey[]
  locale: Locale
}

/** Phone tab bar. Hidden from `lg` up, where `SchoolSidebar` takes over. */
export function SchoolBottomNav({
  config,
  role,
  entitledModules,
  locale,
}: SchoolNavProps) {
  const pathname = usePathname()
  const filter = useSchoolNavFilter(role, entitledModules)

  return (
    <BottomNavFromConfig
      config={config}
      filter={filter}
      pathname={pathname}
      renderLink={renderLink}
      locale={locale}
      navLabel="School"
    />
  )
}

/** Desktop rail. The same filtered tree as `SchoolBottomNav`, laid out vertically. */
export function SchoolSidebar({
  config,
  role,
  entitledModules,
  locale,
}: SchoolNavProps) {
  const pathname = usePathname()
  const filter = useSchoolNavFilter(role, entitledModules)

  return (
    <SidebarFromConfig
      config={config}
      filter={filter}
      pathname={pathname}
      renderLink={renderLink}
      locale={locale}
      title="Acadigma Campus"
      navLabel="School"
    />
  )
}
