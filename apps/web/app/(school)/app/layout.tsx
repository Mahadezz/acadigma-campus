import { BellIcon } from "lucide-react"

import { getNavConfig, type NavConfig } from "@acadigma/domain/nav"
import { Button } from "@acadigma/ui/components/button"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

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
 * The shell owns the single `<h1>`; pages below start their headings at `<h2>`.
 */
export default async function SchoolLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireWorkspace()
  const client = await createClient()

  const entitledModules = await resolveEntitledNavModules(ctx, client)
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
