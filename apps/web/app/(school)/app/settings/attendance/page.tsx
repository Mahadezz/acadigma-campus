import { forbidden } from "next/navigation"

import { getAttendancePolicySample } from "@acadigma/db/repositories/attendance-policy-preview"
import { getSchoolSettings } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { AttendancePolicyForm } from "./attendance-policy-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Attendance policy" }

/**
 * F-OP-07 Part 3 §4 W4 — owner/admin (`policies.manage`, same gate as
 * `updateSchoolSettings`; the spec's `settings.attendance.write` was never
 * introduced as a separate key, see D-212). Teachers/staff already see the
 * read-only summary at `/app/settings/overview`.
 */
export default async function AttendancePolicySettingsPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "policies.manage")) forbidden()

  const { t, locale } = await getMessages()
  const a = t.settings.attendance
  const supabase = await createClient()
  const [settings, sample] = await Promise.all([
    getSchoolSettings(supabase, ctx),
    getAttendancePolicySample(supabase, ctx),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader title={a.title} description={a.description} />
      {!settings.ok ? (
        <InlineAlert tone="error">{settings.error.message}</InlineAlert>
      ) : (
        <AttendancePolicyForm
          policy={settings.data.attendancePolicy}
          sample={
            sample.ok
              ? sample.data
              : { studentName: null, month: null, statuses: [] }
          }
          t={t.settings}
          locale={locale}
        />
      )}
    </div>
  )
}
