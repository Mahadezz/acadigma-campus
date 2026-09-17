import { BellIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { requireWorkspace } from "@/lib/workspace"

import { SchoolBottomNav, SchoolSidebar } from "./nav"

/**
 * School workspace shell.
 *
 * Resolving the workspace here means every screen below `/app` has a verified
 * membership before it renders — there is no route in this group reachable without
 * one. The role it returns is what filters the nav.
 *
 * The shell owns the single `<h1>`; pages below start their headings at `<h2>`.
 */
export default async function SchoolLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { role } = await requireWorkspace()

  return (
    <AppShell
      sidebar={<SchoolSidebar role={role} />}
      bottomNav={<SchoolBottomNav role={role} />}
      topBar={
        <TopBar
          title="Acadigma Campus"
          subtitle={`Signed in as ${role}`}
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
