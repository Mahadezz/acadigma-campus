/**
 * Navigation config composition for the UI layer (DESIGN-SYSTEM §3.2).
 *
 * `NavItem`/`NavGroup`/`NavConfig`/`NavModuleKey`, `filterNav` and the five
 * curated school/family/personal trees now live in `@acadigma/domain/nav` —
 * the single source both the server (route guards, F-ID-03 Part 3) and this
 * client-side composition read, so they can never drift the way they did
 * before D-56 (this file used to hold its own parallel copy of all of it).
 * `BottomNav`/`Sidebar` are the two renderers of that one config; the shell
 * changes, the config does not (DESIGN-SYSTEM §3.1).
 *
 * What stays genuinely UI-only:
 * - icon name -> `lucide-react` component resolution (`IconName`/`ICON_MAP`
 *   in `bottom-nav.tsx` and `sidebar-from-config.tsx`) — domain has no UI
 *   dependency, so `NavItem.icon` is a plain string there.
 * - the seller (`/sell`) and platform (`/platform`) sub-shell trees.
 *   `packages/domain`'s `resolveNavConfigKey` deliberately returns `null` for
 *   both — they are not resolved from `workspace type ∧ role`, they are
 *   entered from a link/the avatar menu (DESIGN-SYSTEM §3.2) — so they have
 *   no home in the domain nav engine and are authored here instead.
 */
import * as React from "react"

import {
  BOTTOM_NAV_PRIMARY_MAX,
  filterNav,
  NAV_CONFIGS,
  NAV_MODULE_KEYS,
  type NavConfig,
  type NavConfigKey,
  type NavGroup,
  type NavItem,
  type NavModuleKey,
} from "@acadigma/domain/nav"
import type { WorkspaceRole } from "@acadigma/domain/permissions"

export type { NavConfig, NavConfigKey, NavGroup, NavItem, NavModuleKey }

/** One tree-shaken icon per item, resolved by name so a config stays serialisable. */
export type IconName =
  | "layout-dashboard"
  | "clipboard-check"
  | "users"
  | "message-circle"
  | "school"
  | "calendar-days"
  | "file-check"
  | "list-checks"
  | "book-open"
  | "clipboard-list"
  | "notebook"
  | "user-cog"
  | "shield-check"
  | "briefcase"
  | "user-round-search"
  | "tag"
  | "bar-chart-3"
  | "printer"
  | "megaphone"
  | "library"
  | "sparkles"
  | "credit-card"
  | "wallet"
  | "store"
  | "trending-up"
  | "history"
  | "settings"
  | "life-buoy"
  | "book-marked"
  | "heart-handshake"
  | "alert-triangle"
  | "file-text"
  | "folder-open"
  | "gauge"
  | "folder-lock"
  | "id-card"
  | "home"
  | "package"
  | "receipt"
  | "hand-coins"
  | "building-2"
  | "arrow-left-right"
  | "more-horizontal"

/** Named re-exports of the five curated trees, matching the DESIGN-SYSTEM §3.2
 * section names this file used to define locally. */
export const schoolAdminNav: NavConfig = NAV_CONFIGS["school:owner_admin"]
export const schoolTeacherNav: NavConfig = NAV_CONFIGS["school:teacher"]
export const schoolStaffNav: NavConfig = NAV_CONFIGS["school:staff"]
export const parentNav: NavConfig = NAV_CONFIGS["family:parent"]
export const personalNav: NavConfig = NAV_CONFIGS["personal:owner"]

export type BadgeSource = { count?: number }

export { BOTTOM_NAV_PRIMARY_MAX }

export type NavFilterContext = {
  role: string
  /** Plan-entitlement + feature-flag check for a gated module. */
  hasModule: (module: NavModuleKey) => boolean
}

/**
 * Applies `role ∧ plan-entitlement` to a nav config by delegating to
 * `@acadigma/domain/nav`'s `filterNav` — this function only adapts the
 * `hasModule` predicate this package's callers already pass into the
 * `entitledModules` set `filterNav` expects. Pure — safe to call on the
 * server or memoise on the client via `useFilteredNav`.
 *
 * `role` is typed loosely (`string`) because this same context also filters
 * the seller/platform trees below, neither of which is a `WorkspaceRole` —
 * their items never declare `roles`, so the cast below is never actually
 * exercised for them.
 */
export function filterNavConfig(
  config: NavConfig,
  ctx: NavFilterContext
): NavConfig {
  const entitledModules = new Set(
    NAV_MODULE_KEYS.filter((key) => ctx.hasModule(key))
  )
  const filtered = filterNav(config, {
    role: ctx.role as WorkspaceRole,
    entitledModules,
  })
  return {
    bottom: filtered.bottom.slice(0, BOTTOM_NAV_PRIMARY_MAX),
    more: filtered.more,
  }
}

/** Client-side memoised version of `filterNavConfig`, for `AppShell`/`BottomNav`. */
export function useFilteredNav(
  config: NavConfig,
  ctx: NavFilterContext
): NavConfig {
  const { role, hasModule } = ctx
  return React.useMemo(
    () => filterNavConfig(config, { role, hasModule }),
    [config, role, hasModule]
  )
}

/** Sum of every visible item's badge count, for the aggregate badge on "More". */
export function aggregateMoreBadgeCount(config: NavConfig): number {
  return config.more.reduce(
    (total, group) =>
      total +
      group.items.reduce((sum, item) => sum + (item.badge?.count ?? 0), 0),
    0
  )
}

/** Small builder so the tables below read close to the §3.2 source tables. */
function item(
  id: string,
  href: string,
  labelEn: string,
  labelBn: string,
  icon: IconName
): NavItem {
  return { id, href, labelEn, labelBn, icon }
}

// ---------------------------------------------------------------------------
// Seller area `/sell` — a focused sub-shell, not a workspace (§3.2)
// ---------------------------------------------------------------------------

export const sellerNav: NavConfig = {
  bottom: [
    item("dashboard", "/sell", "Dashboard", "ড্যাশবোর্ড", "home"),
    item("listings", "/sell/listings", "Listings", "তালিকা", "package"),
    item("orders", "/sell/orders", "Orders", "অর্ডার", "receipt"),
    item("earnings", "/sell/earnings", "Earnings", "আয়", "hand-coins"),
  ],
  more: [
    {
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "kyc",
          "/sell/kyc",
          "Verification & KYC",
          "যাচাইকরণ ও কেওয়াইসি",
          "shield-check"
        ),
        item(
          "payout-methods",
          "/sell/payouts",
          "Payout methods",
          "পেআউট পদ্ধতি",
          "credit-card"
        ),
        item(
          "storefront",
          "/sell/storefront",
          "Storefront",
          "স্টোরফ্রন্ট",
          "store"
        ),
        item(
          "statements",
          "/sell/statements",
          "Monthly statements",
          "মাসিক বিবরণী",
          "file-text"
        ),
        item(
          "browse-marketplace",
          "/market",
          "Browse marketplace",
          "মার্কেটপ্লেস দেখুন",
          "store"
        ),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Platform console `/platform` (§3.2) — gated on `is_platform_admin`
// server-side (F-ID-08), not on a `WorkspaceRole`, so no item here declares
// `roles` at all.
// ---------------------------------------------------------------------------

export const platformNav: NavConfig = {
  bottom: [
    item("queue", "/platform/queue", "Queue", "সারি", "clipboard-list"),
    item("sellers", "/platform/sellers", "Sellers", "বিক্রেতা", "store"),
    item("payouts", "/platform/payouts", "Payouts", "পেআউট", "hand-coins"),
    item(
      "workspaces",
      "/platform/workspaces",
      "Workspaces",
      "কর্মক্ষেত্র",
      "building-2"
    ),
  ],
  more: [
    {
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "refunds",
          "/platform/refunds",
          "Refunds",
          "ফেরত",
          "arrow-left-right"
        ),
        item(
          "plans-pricing",
          "/platform/plans",
          "Plans & pricing",
          "প্ল্যান ও মূল্য",
          "credit-card"
        ),
        item(
          "platform-settings",
          "/platform/settings",
          "Platform settings",
          "প্ল্যাটফর্ম সেটিংস",
          "settings"
        ),
        item("audit", "/platform/audit", "Audit", "অডিট", "shield-check"),
        item(
          "exit",
          "/app/dashboard",
          "Exit to my workspace",
          "আমার কর্মক্ষেত্রে ফিরুন",
          "arrow-left-right"
        ),
      ],
    },
  ],
}
