import { hasModule, type PlanModuleSet } from "../plans"

import { NAV_MODULE_KEYS, type NavModuleKey } from "./types"

/**
 * `NAV_MODULE_KEYS` (this folder) gates the phone/desktop nav per SCREEN —
 * "timetable", "exams", "marks" are each their own key, transcribed from
 * DESIGN-SYSTEM §3.2 in F-ID-03 Part 3. `plan_modules.module` (F-CM-06 Part 1,
 * `20260917010300_plans_and_notifications.sql`) gates a plan per BUNDLE —
 * "academics" covers timetable/exams/marks/assignments/curriculum/students at
 * once, and several nav keys (`staff`, `billing`, `ai`) have no plan-catalogue
 * equivalent yet at all.
 *
 * The two taxonomies were never reconciled (D-56, M0 wrap-up). Until they
 * are, this map only names the nav keys that DO have a real plan-module
 * equivalent today; every other nav key is intentionally left unmapped and
 * `buildEntitledNavModules` always includes it — a missing mapping must never
 * silently hide a screen nobody meant to gate.
 */
export const NAV_MODULE_TO_PLAN_MODULE: Partial<Record<NavModuleKey, string>> =
  {
    attendance: "attendance",
    timetable: "academics",
    students: "academics",
    exams: "academics",
    marks: "academics",
    assignments: "academics",
    curriculum: "academics",
    lessons: "lessons",
    resources: "resources",
    library: "resources",
    reports: "reports",
    print: "print",
    messages: "messaging",
    hiring: "hiring",
    cover: "cover",
    marketplace: "marketplace_school_funded",
  }

/**
 * Builds the `entitledModules` set `filterNav`'s `NavVisibilityContext`
 * expects, from the workspace's enabled plan module codes
 * (`packages/db`'s `listEnabledModules`), via the plans engine's own
 * `hasModule` (F-CM-06 §4.6) — never a hand-rolled `.includes()` here, so the
 * "unlimited unless gated" convention stays in one place.
 */
export function buildEntitledNavModules(
  planModules: PlanModuleSet
): ReadonlySet<NavModuleKey> {
  const entitled = new Set<NavModuleKey>()
  for (const key of NAV_MODULE_KEYS) {
    const planModuleKey = NAV_MODULE_TO_PLAN_MODULE[key]
    if (!planModuleKey || hasModule(planModules, planModuleKey)) {
      entitled.add(key)
    }
  }
  return entitled
}
