import { forbidden } from "next/navigation"

import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SettingsHistory } from "../settings-history"
import { SubPageHeader } from "../sub-page-header"

import { ProfileForm } from "./profile-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "School profile" }

/** F-OP-07 §4 W2 / §6 "School profile" — owner/admin only (§2). */
export default async function SchoolProfilePage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "workspace.settings.write")) forbidden()

  const { t, locale } = await getMessages()
  const profile = await getSchoolProfile(await createClient(), ctx)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={t.settings.profile.title}
        description={t.settings.profile.description}
      />
      {profile.ok ? (
        <ProfileForm
          profile={profile.data}
          t={t.settings}
          wizard={t.onboarding.wizard}
        />
      ) : (
        <InlineAlert tone="error">{profile.error.message}</InlineAlert>
      )}
      <SettingsHistory
        ctx={ctx}
        fieldLabels={t.settings.profile.fields}
        t={t.settings.history}
        locale={locale}
      />
    </div>
  )
}
