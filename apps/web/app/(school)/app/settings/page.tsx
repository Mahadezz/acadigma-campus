import Link from "next/link"
import { redirect } from "next/navigation"

import { ChevronRightIcon } from "lucide-react"

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
      href: "/app/settings/grade-scale",
      ...s.rows.grading,
      summary: s.rows.grading.description,
    },
    {
      href: "/app/settings/attendance",
      ...s.rows.attendance,
      summary: s.rows.attendance.description,
    },
    {
      href: "/app/settings/academic",
      ...s.rows.academic,
      summary: s.rows.academic.description,
    },
    {
      href: "/app/settings/labels",
      ...s.rows.labels,
      summary: s.rows.labels.description,
    },
    {
      href: "/app/settings/overview",
      ...s.rows.overview,
      summary: s.rows.overview.description,
    },
    {
      href: "/app/settings/display",
      ...s.rows.display,
      summary: s.rows.display.description,
    },
    // F-ID-01 Part 7 (D-113): password and account deletion, account-level.
    {
      href: "/account/security",
      ...s.rows.account,
      summary: s.rows.account.description,
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
      {/* F-OP-07 W8 (D-211): owner only, set apart at the bottom. */}
      {can(ctx.role, "settings.manage") ? (
        <Link
          href="/app/settings/danger"
          className="border-destructive/40 hover:bg-muted/50 flex min-h-14 items-center gap-3 rounded-lg border px-4 py-3"
        >
          <span className="min-w-0 flex-1">
            <span className="text-destructive block font-medium">
              {t.dangerZone.rowTitle}
            </span>
            <span className="text-muted-foreground block truncate text-sm">
              {t.dangerZone.rowDescription}
            </span>
          </span>
          <ChevronRightIcon
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden
          />
        </Link>
      ) : null}
    </div>
  )
}
