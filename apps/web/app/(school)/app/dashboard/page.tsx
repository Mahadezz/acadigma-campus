import { todayIn } from "@acadigma/domain/time"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import { requireWorkspace } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard",
}

/**
 * Landing screen for a school workspace.
 *
 * It resolves the workspace again rather than reading it from the layout: React
 * de-duplicates the underlying request within a render pass, and a page that states
 * its own requirement cannot be moved out from under its guard by accident.
 */
export default async function DashboardPage() {
  const { role, plan, workspaceId } = await requireWorkspace()
  // "Today" is the workspace's day, not the server's (ARCHITECTURE §4).
  const today = todayIn()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Today · {today}
        </h2>
        <StatusChip tone={plan ? "positive" : "neutral"}>
          {plan ?? "No plan"}
        </StatusChip>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace resolved</CardTitle>
          <CardDescription>
            Membership was verified against <code>workspace_members</code>{" "}
            before this screen rendered. Role <strong>{role}</strong>, workspace{" "}
            <code className="break-all">{workspaceId}</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
