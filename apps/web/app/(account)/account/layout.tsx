import { redirect } from "next/navigation"

import { DeletionBanner } from "@/app/(shared)/account/deletion-banner"
import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { BackLink } from "./back-link"

/**
 * Account-level settings (OQ-3) sit outside every workspace shell, so this
 * route had no way back into the app (the reason D-405 dropped its link).
 * One back link to /app — which resolves to the right shell for any role —
 * and the deletion-grace banner (D-113). No Back link on /account/legal
 * (D-115), where /app would only send the person back.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=%2Faccount%2Fsecurity")
  const { t } = await getMessages()

  return (
    <div className="bg-background min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center px-2 py-1 sm:px-4">
          <BackLink label={t.common.actions.back} />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 pt-4 empty:hidden sm:px-6">
        <DeletionBanner userId={user.id} />
      </div>
      <main>{children}</main>
    </div>
  )
}
