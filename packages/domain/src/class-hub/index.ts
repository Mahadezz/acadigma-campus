import type { ClassHubTabId } from "@acadigma/contracts"

/**
 * F-ID-10 §4.5/§8 Part 3 — every class-hub tab this Part actually ships,
 * in display order. The same `IMPLEMENTED_NAV_ROUTES` discipline D-400
 * uses for the main nav: this list holds only tabs with a real page today
 * (Attendance/Marks/Students/Print) — never a "coming soon" placeholder.
 * Each later Part that ships a class-shaped screen (routine, handouts,
 * lesson plan, homework — spec §8's closing note) appends its own id here
 * in its own PR; `class-hub-tabs.test.ts` (apps/web) keeps this list and
 * the tab view's rendering in step, the same two-directions idea
 * `implemented-routes.test.ts` already uses for pages.
 */
export const CLASS_HUB_TABS: readonly ClassHubTabId[] = [
  "attendance",
  "marks",
  "students",
  "print",
]
