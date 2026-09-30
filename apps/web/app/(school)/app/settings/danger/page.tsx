import { getDangerZoneState } from "@acadigma/db"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { toIntlLocale } from "@/lib/locale"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { DangerZoneView } from "./danger-zone-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Danger zone" }

/**
 * F-OP-07 §4 W8 / Part 6 (D-211): export, archive, delete — owner only. An
 * admin who opens the URL sees no action at all (AC33); the server actions and
 * the database refuse them anyway. Reaching an action takes two deliberate
 * steps from the settings list (open this page, then open the action's own
 * confirmation and type the school's name — §4 W9).
 */
export default async function DangerZonePage() {
  const ctx = await requireShell("school")
  const { t, locale } = await getMessages()
  const d = t.dangerZone

  const header = (
    <SubPageHeader
      title={d.title}
      description={d.lead}
    />
  )
  if (!can(ctx.role, "settings.manage")) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <InlineAlert tone="info">{d.ownerOnly}</InlineAlert>
      </div>
    )
  }

  const state = await getDangerZoneState(ctx, await createClient())
  if (!state.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <InlineAlert tone="error">{d.errors.generic}</InlineAlert>
      </div>
    )
  }

  const day = new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const { name, status, archivedAt, deletionScheduledAt } = state.data

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {header}
      <DangerZoneView
        t={d}
        schoolName={name}
        archived={status === "archived"}
        archivedOn={archivedAt ? day.format(new Date(archivedAt)) : null}
        deletionOn={
          deletionScheduledAt ? day.format(new Date(deletionScheduledAt)) : null
        }
      />
    </div>
  )
}
