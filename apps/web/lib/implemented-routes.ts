import type { NavConfig } from "@acadigma/domain/nav"

/**
 * Every in-app destination the shell links to that has a real page today. The nav configs in
 * `@acadigma/domain/nav` (DESIGN-SYSTEM §3.2) describe the whole product; this
 * list says which of those links can be followed right now. A nav item whose
 * href is not listed is hidden, so the shell never renders (or prefetches) a
 * link to a 404 — and the configs stay intact, so each feature appears the
 * moment its Part adds its page here.
 *
 * `implemented-routes.test.ts` keeps this honest in both directions: every
 * listed route must have a `page.tsx`, and every nav href that has a
 * `page.tsx` must be listed.
 */
export const IMPLEMENTED_NAV_ROUTES: ReadonlySet<string> = new Set([
  "/app/dashboard",
  "/app/settings",
  "/app/audit",
  "/app/classes",
  "/app/students",
  // Not a nav item; the dashboard's setup checklist links here (D-400).
  "/app/settings/branding",
  "/personal",
  "/family",
])

/** `config` with every unimplemented item removed, and empty groups dropped. */
export function onlyImplemented(config: NavConfig): NavConfig {
  const routes = IMPLEMENTED_NAV_ROUTES
  return {
    bottom: config.bottom.filter((item) => routes.has(item.href)),
    more: config.more
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => routes.has(item.href)),
      }))
      .filter((group) => group.items.length > 0),
  }
}
