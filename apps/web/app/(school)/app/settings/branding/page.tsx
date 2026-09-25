import { forbidden } from "next/navigation"

import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SettingsHistory } from "../settings-history"
import { SubPageHeader } from "../sub-page-header"

import { BrandingForm } from "./branding-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Branding" }

/** F-OP-07 §4 W2 / §6 "Branding" — owner/admin only (§2). */
export default async function BrandingPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "workspace.branding.write")) forbidden()

  const { t, locale } = await getMessages()
  const profile = await getSchoolProfile(await createClient(), ctx)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={t.settings.branding.title}
        description={t.settings.branding.description}
      />
      {profile.ok ? (
        <BrandingForm profile={profile.data} t={t.settings} />
      ) : (
        <InlineAlert tone="error">{profile.error.message}</InlineAlert>
      )}
      <SettingsHistory
        ctx={ctx}
        fieldLabels={{ branding: t.settings.branding.title }}
        t={t.settings.history}
        locale={locale}
      />
    </div>
  )
}
