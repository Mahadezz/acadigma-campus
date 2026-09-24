import { BellIcon } from "lucide-react"

import { requireWritable } from "@acadigma/db"
import { getNavConfig, type NavConfig } from "@acadigma/domain/nav"
import { Button } from "@acadigma/ui/components/button"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
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

  const [entitledModules, writable] = await Promise.all([
    resolveEntitledNavModules(ctx, client),
    requireWritable(ctx, client),
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
      {writable.ok ? null : (
        // F-CM-06 Part 4 (D-62): a Pro trial past trial_ends_at (or any other
        // access_mode=read_only cause) shows here, on every screen — reads,
        // exports, edits and deletes still work; only creating something new is
        // blocked (§5.6), which the reason text below explains.
        <InlineAlert
          tone="error"
          title="This workspace is read-only"
          className="mb-4"
        >
          {writable.error.reason ??
            "Upgrade to keep adding new records — nothing has been deleted."}
        </InlineAlert>
      )}
      {children}
    </AppShell>
  )
}
