import { forbidden, redirect } from "next/navigation"

import { resolveShellGate } from "@acadigma/domain/workspace"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { listMyWorkspaces } from "@/app/(shared)/workspace/actions"
import { WorkspaceSwitcher } from "@/app/(shared)/workspace/workspace-switcher"
import { requireWorkspace } from "@/lib/workspace"

/**
 * Personal workspace shell (F-ID-03 §8 Part 4 / ROADMAP M1 1.1).
 *
 * Minimal on purpose: F-ID-06 owns the personal workspace's real screens
 * (tutoring students, attendance, files, diary, CV — `personal:owner`'s
 * curated nav in `packages/domain/src/nav/config.ts` already lists them).
 * Until that Part lands, this shell exists only so `resolveLandingRoute`'s
 * `/personal` destination is real and gated, instead of 404ing for the
 * personal-only and tutoring users F-ID-05 Part 1 already creates. No bottom
 * nav/sidebar is wired here yet — deliberately, so nothing here links to a
 * route that doesn't exist (the exact bug this Part's gate closes for the
 * school shell).
 */
export default async function PersonalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireWorkspace()

  const gate = resolveShellGate("personal", {
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
          title="Personal workspace"
        />
      }
    >
      {children}
    </AppShell>
  )
}
