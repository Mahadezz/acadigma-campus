import { can, type Action, type WorkspaceRole } from "../permissions"

import type { NavConfig, NavGroup, NavItem, NavModuleKey } from "./types"

/**
 * Everything `filterNav` needs to decide item visibility. `entitledModules` /
 * `hiddenModules` are optional so unit tests (and any caller that has not
 * loaded plan/visibility data yet) can pass only `role` and get role-only
 * filtering — the module gate is additive, never required to produce a result.
 */
export type NavVisibilityContext = {
  role: WorkspaceRole
  /** Modules the workspace's plan includes. Absent module key ⇒ not gated by plan here. */
  entitledModules?: ReadonlySet<NavModuleKey>
  /** Modules an owner has explicitly hidden (`workspace_modules.is_visible = false`). */
  hiddenModules?: ReadonlySet<NavModuleKey>
  /**
   * Maps a nav item's implicit action for an extra `can()` check, beyond the
   * item's own `roles` list — lets a caller enforce the exact same matrix
   * `packages/domain/permissions.ts` exports, per F-ID-03 Part 3's "nav and
   * route guards read the same matrix" test. Optional: omit to filter by
   * `item.roles` alone.
   */
  actionFor?: (item: NavItem) => Action | undefined
}

function isItemVisible(item: NavItem, ctx: NavVisibilityContext): boolean {
  if (item.roles && !item.roles.includes(ctx.role)) return false

  if (item.module) {
    if (ctx.entitledModules && !ctx.entitledModules.has(item.module)) {
      return false
    }
    if (ctx.hiddenModules?.has(item.module)) return false
  }

  const action = ctx.actionFor?.(item)
  if (action && !can(ctx.role, action)) return false

  return true
}

function filterGroup(group: NavGroup, ctx: NavVisibilityContext): NavGroup {
  return {
    ...group,
    items: group.items.filter((item) => isItemVisible(item, ctx)),
  }
}

/**
 * `filterNav(config, ctx)` — the one function both `AppShell` (bottom nav +
 * sidebar) and route-level guards call, so they can never drift (F-ID-03
 * Part 3 test: "nav and route guards read the same matrix", the direct fix
 * for prototype D6 — `module_*` toggles that no navigation code ever read).
 *
 * Pure: no I/O, no React, entirely deterministic from its arguments.
 * `more` groups that end up empty after filtering are dropped, so the UI
 * never renders a "More" section with nothing in it.
 */
export function filterNav(
  config: NavConfig,
  ctx: NavVisibilityContext
): NavConfig {
  const bottom = config.bottom.filter((item) => isItemVisible(item, ctx))
  const more = config.more
    .map((group) => filterGroup(group, ctx))
    .filter((group) => group.items.length > 0)

  return { bottom, more }
}

/**
 * True when `href` (or a descendant path of it) is reachable for this
 * context under the given config — the same predicate a route guard uses to
 * 404 a hidden module (F-ID-03 §4.9, AC11). Checks both `bottom` and every
 * `more` group of the *unfiltered* config, so a route that is merely demoted
 * out of the bottom bar (but still visible in More) stays reachable.
 */
export function isRouteVisible(
  config: NavConfig,
  ctx: NavVisibilityContext,
  href: string
): boolean {
  const filtered = filterNav(config, ctx)
  const allItems = [
    ...filtered.bottom,
    ...filtered.more.flatMap((group) => group.items),
  ]
  return allItems.some(
    (item) => href === item.href || href.startsWith(`${item.href}/`)
  )
}
