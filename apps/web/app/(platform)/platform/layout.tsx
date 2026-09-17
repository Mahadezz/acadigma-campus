import { forbidden, redirect } from "next/navigation"

import { isPlatformAdmin } from "@acadigma/db"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { createClient } from "@/lib/supabase/server"

/**
 * Acadigma staff console (DECISION-LOG D-16).
 *
 * Gated on `profiles.is_platform_admin`, which only the platform itself can write.
 * This is a workspace-free area: platform staff act on listings, payouts and
 * moderation queues, never on a school's academic data — the permissions matrix
 * gives the `platform` role no tenant actions at all.
 */
export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/platform")

  if (!(await isPlatformAdmin(supabase))) forbidden()

  return (
    <AppShell
      topBar={<TopBar title="Acadigma platform" subtitle="Staff console" />}
    >
      {children}
    </AppShell>
  )
}
