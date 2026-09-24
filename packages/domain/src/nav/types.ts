import type { WorkspaceRole } from "../permissions"

/**
 * Module keys a nav item can be gated on (F-ID-03 §3 `workspace_modules.module_key`).
 * Kept as a local, minimal list here rather than importing a shared
 * `packages/domain/modules.ts` dependency graph, which is out of this Part's
 * scope (F-ID-03 Part 3 build list) — when that module ships, this type should
 * be replaced by its exported `ModuleKey`.
 */
export const NAV_MODULE_KEYS = [
  "attendance",
  "timetable",
  "students",
  "exams",
  "marks",
  "assignments",
  "lessons",
  "curriculum",
  "resources",
  "library",
  "reports",
  "print",
  "messages",
  "hiring",
  "cover",
  "staff",
  "billing",
  "ai",
  "marketplace",
] as const

export type NavModuleKey = (typeof NAV_MODULE_KEYS)[number]

export function isNavModuleKey(value: unknown): value is NavModuleKey {
  return (
    typeof value === "string" &&
    (NAV_MODULE_KEYS as readonly string[]).includes(value)
  )
}

/**
 * One nav entry (DESIGN-SYSTEM §3.2). `icon` is a name, not a component — this
 * package has no UI dependency; `packages/ui`'s `BottomNav`/`Sidebar` map the
 * name to a `lucide-react` icon.
 */
export type NavItem = {
  id: string
  href: string
  labelEn: string
  labelBn: string
  icon: string
  /** Omitted = visible to every role the surrounding config already applies to. */
  roles?: readonly WorkspaceRole[]
  /** Gated by plan entitlement ∧ owner visibility (PRODUCT-DECISIONS §1.12). */
  module?: NavModuleKey
}

/** A labelled section inside the "More" sheet. */
export type NavGroup = {
  id: string
  labelEn: string
  labelBn: string
  items: readonly NavItem[]
}

/**
 * `bottom` is the phone tab bar's real slots — at most 4, the 5th slot is
 * always the "More" trigger the UI renders itself whenever `more` is
 * non-empty (DESIGN-SYSTEM §3.1 "5 items maximum ... slot 5 is always More").
 * Desktop renders `bottom` and every item inside `more` flattened into one
 * sidebar, since the space constraint that created "More" does not exist there.
 */
export type NavConfig = {
  bottom: readonly NavItem[]
  more: readonly NavGroup[]
}

export const BOTTOM_NAV_PRIMARY_MAX = 4

/** The five curated layouts DESIGN-SYSTEM §3.2 defines. */
export const NAV_CONFIG_KEYS = [
  "school:owner_admin",
  "school:teacher",
  "school:staff",
  "family:parent",
  "personal:owner",
] as const

export type NavConfigKey = (typeof NAV_CONFIG_KEYS)[number]
