import { forbidden, redirect } from "next/navigation"

import { resolveShellGate } from "@acadigma/domain/workspace"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { listMyWorkspaces } from "@/app/(shared)/workspace/actions"
import { WorkspaceSwitcher } from "@/app/(shared)/workspace/workspace-switcher"
import { requireWorkspace } from "@/lib/workspace"

/**
 * Parent/guardian shell (F-ID-03 §8 Part 4 / ROADMAP M1 1.1).
 *
 * Minimal on purpose: F-AC-10 owns the real parent portal (child switcher +
 * 13 guardian-scoped views — `family:parent`'s curated nav in
 * `packages/domain/src/nav/config.ts` already lists them). Until that Part
 * lands, this shell exists only so `resolveLandingRoute`'s `/family`
 * destination is real and gated for a `parent` member, instead of leaving
 * them on the school shell's `/app` (which they must never see, F-ID-03
 * §4.4 OQ-1) or 404ing. No bottom nav/sidebar is wired here yet —
 * deliberately, so nothing here links to a route that doesn't exist.
 */
export default async function FamilyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireWorkspace()

  const gate = resolveShellGate("family", {
    workspaceType: ctx.workspaceType,
    role: ctx.role,
  })
  if (gate.kind === "redirect") redirect(gate.to)
  if (gate.kind === "forbidden") forbidden()

  const workspacesResult = await listMyWorkspaces()

  return (
    <AppShell
      topBar={
        <TopBar
          leading={
            <WorkspaceSwitcher
              workspaces={workspacesResult.ok ? workspacesResult.data : []}
              currentWorkspaceId={ctx.workspaceId}
            />
          }
          title="Family"
        />
      }
    >
      {children}
    </AppShell>
  )
}
