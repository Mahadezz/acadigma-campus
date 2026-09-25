import { redirect } from "next/navigation"

import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SettingsHome, type SettingsRow } from "./settings-home"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Settings" }

/**
 * F-OP-07 §4 W1 / §6 "Settings home". Owners and admins get the grouped rows;
 * teachers and staff land on the read-only "How this school works" page (§2 ¹).
 */
export default async function SettingsPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "workspace.settings.write")) {
    redirect("/app/settings/overview")
  }

  const { t } = await getMessages()
  const s = t.settings
  const profile = await getSchoolProfile(await createClient(), ctx)
  const fields = profile.ok ? profile.data.fields : null
  const branding = profile.ok ? profile.data.branding : null

  const rows: SettingsRow[] = [
    {
      href: "/app/settings/school",
      ...s.rows.school,
      summary:
        [fields?.legal_name, fields?.eiin && `EIIN ${fields.eiin}`]
          .filter(Boolean)
          .join(" · ") || s.notSet,
    },
    {
      href: "/app/settings/branding",
      ...s.rows.branding,
      summary: branding?.header_line_1 || branding?.accent || s.notSet,
    },
    {
      href: "/app/settings/calendar",
      title: s.calendar.title,
      description: s.calendar.rowDescription,
      keywords: s.calendar.rowKeywords,
      summary: s.calendar.rowDescription,
    },
    {
      href: "/app/settings/overview",
      ...s.rows.overview,
      summary: s.rows.overview.description,
    },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
      <SettingsHome
        rows={rows}
        t={{
          searchLabel: s.searchLabel,
          searchPlaceholder: s.searchPlaceholder,
          searchEmpty: s.searchEmpty,
        }}
      />
    </div>
  )
}
