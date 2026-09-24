import { redirect } from "next/navigation"

import { requireShell } from "@/lib/workspace"

/**
 * F-ID-03 §4.4: `resolveLandingRoute` sends every school-shell role to `/app`
 * itself (the shell root), not to a specific screen — that stays a routing
 * decision, not a domain one, per DESIGN-SYSTEM §3.1's "Today"/"Overview"/"Home"
 * tab always occupying bottom-nav slot 1. `/app/dashboard` is that slot.
 *
 * Calls `requireShell("school")` itself rather than trusting the layout ran
 * it: a client-side navigation can reach this page without the layout
 * re-rendering (PR #30 review), and `/app` is otherwise the one route in this
 * shell with no page-level gate of its own to catch that.
 */
export default async function SchoolShellIndexPage() {
  await requireShell("school")
  redirect("/app/dashboard")
}
