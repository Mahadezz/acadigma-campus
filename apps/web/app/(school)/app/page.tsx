import { redirect } from "next/navigation"

import { getUiPreferences } from "@/lib/ui-preferences"
import { requireShell } from "@/lib/workspace"

/**
 * F-ID-03 §4.4: `resolveLandingRoute` sends every school-shell role to `/app`
 * itself (the shell root), not to a specific screen — that stays a routing
 * decision, not a domain one, per DESIGN-SYSTEM §3.1's "Today"/"Overview"/"Home"
 * tab always occupying bottom-nav slot 1. `/app/dashboard` is that slot.
 *
 * F-ID-10 §4.3/AC1 (D-403): `ui_mode='basic'` lands on `/app/home` instead —
 * except a member whose role is `staff` in THIS workspace, who always gets
 * the full dashboard (AC15, F-ID-10 §2 note 4): `ui_mode` is global to the
 * user, but the staff exclusion is per workspace, so a teacher who is staff
 * here and a teacher elsewhere must not lose their basic-mode choice on the
 * other school just because this one redirected them to full once.
 *
 * Calls `requireShell("school")` itself rather than trusting the layout ran
 * it: a client-side navigation can reach this page without the layout
 * re-rendering (PR #30 review), and `/app` is otherwise the one route in this
 * shell with no page-level gate of its own to catch that.
 */
export default async function SchoolShellIndexPage() {
  const ctx = await requireShell("school")
  const { uiMode } = await getUiPreferences()

  if (uiMode === "basic" && ctx.role !== "staff") {
    redirect("/app/home")
  }
  redirect("/app/dashboard")
}
