import { redirect } from "next/navigation"

/**
 * F-ID-03 §4.4: `resolveLandingRoute` sends every school-shell role to `/app`
 * itself (the shell root), not to a specific screen — that stays a routing
 * decision, not a domain one, per DESIGN-SYSTEM §3.1's "Today"/"Overview"/"Home"
 * tab always occupying bottom-nav slot 1. `/app/dashboard` is that slot.
 *
 * `requireWorkspace()` already ran in `(school)/app/layout.tsx` before this
 * page is reached, so by the time this redirect fires membership is verified —
 * this file adds no new access decision of its own.
 */
export default function SchoolShellIndexPage() {
  redirect("/app/dashboard")
}
