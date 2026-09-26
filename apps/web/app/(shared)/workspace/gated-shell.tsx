import type { ShellName } from "@acadigma/domain/workspace"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import { LastUpdated } from "../offline/last-updated"

import { listMyWorkspaces } from "./actions"
import { UserMenu } from "./user-menu"
import { WorkspaceSwitcher } from "./workspace-switcher"

/**
 * F-ID-03 §8 Part 4 review (ponytail): `(personal)/personal/layout.tsx` and
 * `(family)/family/layout.tsx` were ~25 identical lines each — gate, fetch
 * `listMyWorkspaces()`, an `AppShell` with only a `WorkspaceSwitcher` in the
 * top bar. Collapsed into one shell for the two minimal shells; `(school)/app`
 * keeps its own layout because it also renders a sidebar/bottom nav this one
 * does not need.
 *
 * Only calls `requireShell`, not `resolveShellGate` directly — same rule as
 * every shell page (`apps/web/lib/workspace.ts`).
 */
export async function GatedShell({
  shell,
  title,
  children,
}: {
  shell: Exclude<ShellName, "school">
  title: string
  children: React.ReactNode
}) {
  const ctx = await requireShell(shell)
  const { t, locale } = await getMessages()
  const workspacesResult = await listMyWorkspaces()

  return (
    <AppShell
      topBar={
        <TopBar
          leading={
            <WorkspaceSwitcher
              workspaces={workspacesResult.ok ? workspacesResult.data : []}
              currentWorkspaceId={ctx.workspaceId}
              t={t.workspace.switcher}
            />
          }
          title={title}
          actions={
            <UserMenu
              locale={locale}
              t={{
                ...t.workspace.userMenu,
                ...t.auth.languageToggle,
                signOut: t.auth.logout.button,
              }}
            />
          }
        />
      }
    >
      {/* F-ID-11 §4.2 (D-308): the render time travels with a cached copy. */}
      {/* eslint-disable-next-line react-hooks/purity -- the render time is the value */}
      <LastUpdated renderedAt={Date.now()} locale={locale} />
      {children}
    </AppShell>
  )
}
