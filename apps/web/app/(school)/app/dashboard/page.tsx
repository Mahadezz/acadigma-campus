import { formatIsoDate, todayIn } from "@acadigma/domain/time"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import { getMessages } from "@/lib/i18n"
import { toIntlLocale } from "@/lib/locale"
import { requireShell } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard",
}

/**
 * Landing screen for a school workspace.
 *
 * It resolves the workspace (and re-runs the shell gate) again rather than
 * reading it from the layout: React de-duplicates the underlying request
 * within a render pass, and a page that states its own requirement cannot be
 * moved out from under its guard by accident, including by a client-side
 * navigation that skips the layout's own re-render (PR #30 review).
 *
 * This is still the developer debug card (F-ID-03 §8 Part 4); the real
 * "today" dashboard is D-400 (PR #41, in review). This Part's only change
 * here is translating what's on screen and formatting the date with `Intl`
 * bound to the active locale, so it doesn't ship English-only in a bn
 * session in the meantime.
 */
export default async function DashboardPage() {
  const { role, plan, workspaceId } = await requireShell("school")
  const { t, locale } = await getMessages()
  // "Today" is the workspace's day, not the server's (ARCHITECTURE §4).
  const today = formatIsoDate(todayIn(), toIntlLocale(locale))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.dashboard.today.replace("{date}", today)}
        </h2>
        <StatusChip tone={plan ? "positive" : "neutral"}>
          {plan ?? t.dashboard.noPlan}
        </StatusChip>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t.dashboard.workspaceResolvedTitle}
          </CardTitle>
          <CardDescription>
            {t.dashboard.workspaceResolvedDescription
              .replace("{role}", role)
              .replace("{workspaceId}", workspaceId)}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
