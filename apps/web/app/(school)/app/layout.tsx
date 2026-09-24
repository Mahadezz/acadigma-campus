import { forbidden, redirect } from "next/navigation"

import { BellIcon } from "lucide-react"

import { getNavConfig, type NavConfig } from "@acadigma/domain/nav"
import { resolveShellGate } from "@acadigma/domain/workspace"
import { Button } from "@acadigma/ui/components/button"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { listMyWorkspaces } from "@/app/(shared)/workspace/actions"
import { WorkspaceSwitcher } from "@/app/(shared)/workspace/workspace-switcher"
import { resolveEntitledNavModules } from "@/lib/school-nav-entitlements"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

import { SchoolBottomNav, SchoolSidebar } from "./nav"

/**
 * School workspace shell.
 *
 * Resolving the workspace here means every screen below `/app` has a verified
 * membership before it renders — there is no route in this group reachable without
 * one. `role` (and the workspace's plan) are what filter the nav: `getNavConfig`
 * picks the curated tree DESIGN-SYSTEM §3.2 defines for `(workspaceType, role)`
 * from the single nav system in `@acadigma/domain/nav` (D-56) — this shell used
 * to read neither that engine nor `packages/ui`'s curated trees, it hand-rolled
 * its own four-item list.
 *
 * `resolveShellGate` (F-ID-03 §8 Part 4) additionally checks that the resolved
 * membership actually belongs to THIS shell: a `parent` role or a `personal`
 * workspace is redirected to `/family`/`/personal` rather than rendering the
 * `family:parent`/`personal:owner` nav trees here, whose `/family/*`/`/personal/*`
 * hrefs this shell cannot serve (PR #17 review follow-up).
 *
 * The shell owns the single `<h1>`; pages below start their headings at `<h2>`.
 */
export default async function SchoolLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireWorkspace()

  const gate = resolveShellGate("school", {
    workspaceType: ctx.workspaceType,
    role: ctx.role,
  })
  if (gate.kind === "redirect") redirect(gate.to)
  if (gate.kind === "forbidden") forbidden()

  const client = await createClient()

  const [entitledModules, workspacesResult] = await Promise.all([
    resolveEntitledNavModules(ctx, client),
    listMyWorkspaces(),
  ])
  const config: NavConfig = getNavConfig(ctx.workspaceType, ctx.role) ?? {
    bottom: [],
    more: [],
  }

  return (
    <AppShell
      sidebar={
        <SchoolSidebar
          config={config}
          role={ctx.role}
          entitledModules={entitledModules}
        />
      }
      bottomNav={
        <SchoolBottomNav
          config={config}
          role={ctx.role}
          entitledModules={entitledModules}
        />
      }
      topBar={
        <TopBar
          leading={
            <WorkspaceSwitcher
              workspaces={workspacesResult.ok ? workspacesResult.data : []}
              currentWorkspaceId={ctx.workspaceId}
            />
          }
          title="Acadigma Campus"
          subtitle={`Signed in as ${ctx.role}`}
          actions={
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <BellIcon />
            </Button>
          }
        />
      }
    >
      {children}
    </AppShell>
  )
}
