import Link from "next/link"

import type { ShellName } from "@acadigma/domain/workspace"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import { DeletionBanner } from "../account/deletion-banner"
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
              shellLink={
                // D-109: a staff member here as a parent goes back to /app.
                shell === "family" && ctx.role !== "parent"
                  ? { href: "/app", label: t.workspace.switcher.schoolApp }
                  : undefined
              }
            />
          }
          title={title}
          actions={
            <UserMenu
              locale={locale}
              userId={ctx.userId}
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
      {/* F-ID-01 §4.9 (D-113): a pending account deletion. */}
      <DeletionBanner userId={ctx.userId} />
      {children}
      {/* The account page (password, delete account) has no other entry in
          these shells until the user menu gains one (after PR #109). */}
      <Link
        href="/account/security"
        className="text-muted-foreground hover:text-foreground mt-8 inline-flex min-h-11 items-center rounded-md px-2 text-sm underline-offset-4 hover:underline"
      >
        {t.settings.rows.account.title}
      </Link>
    </AppShell>
  )
}
