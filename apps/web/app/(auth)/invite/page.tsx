import { AuthCard } from "@acadigma/ui/primitives/auth-card"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { LanguageToggle } from "../language-toggle"

import { InviteAccept } from "./invite-accept"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Parent invitation",
  // The token is in the fragment; never let a Referer carry this URL on.
  referrer: "no-referrer",
}

/**
 * F-AC-02 Part 4 (D-108): `/invite#<token>` — a guardian's link to the
 * parent app. Signed out: sign in or create an account first (the token
 * waits in this browser). Signed in: see which school and child the link is
 * for, then accept.
 */
export default async function InvitePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { locale, t } = await getMessages()

  return (
    <AuthCard
      title={t.invite.title}
      subtitle={t.invite.subtitle}
      footer={<LanguageToggle current={locale} />}
    >
      <InviteAccept
        t={t.invite}
        relations={t.students.relation}
        locale={locale}
        signedIn={Boolean(user)}
      />
    </AuthCard>
  )
}
