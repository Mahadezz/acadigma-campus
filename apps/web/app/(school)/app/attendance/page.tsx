import { forbidden } from "next/navigation"

import { getAttendanceDay } from "@acadigma/db"
import { getSchoolSettings } from "@acadigma/db/repositories/settings"
import { can, formatIsoDate } from "@acadigma/domain"
import { resolve } from "@acadigma/domain/settings"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { AttendanceToday } from "./attendance-today"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Attendance" }

/**
 * F-AC-03 §6 "Today" — demo cut (D-104): the teacher's own class first with
 * a Take attendance button, then every class of the current year with
 * marked / not marked, who marked it and the counts; the school's rate so
 * far. Parents have their own portal (F-AC-10).
 */
export default async function AttendancePage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "attendance.read") || ctx.role === "parent") forbidden()

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const [day, settings] = await Promise.all([
    getAttendanceDay(supabase, ctx),
    getSchoolSettings(supabase, ctx),
  ])
  if (!day.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <InlineAlert tone="error">
          {t.attendance.roll.errors.generic}
        </InlineAlert>
      </div>
    )
  }
  const policy = (settings.ok ? settings.data : resolve(null)).attendancePolicy

  return (
    <AttendanceToday
      t={t.attendance}
      locale={locale}
      day={day.data}
      dateLabel={formatIsoDate(
        day.data.date,
        locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"
      )}
      policy={{
        late_counts_present: policy.late_counts_present,
        half_day_counts_present: policy.half_day_counts_present,
      }}
      canMark={can(ctx.role, "attendance.write")}
    />
  )
}
