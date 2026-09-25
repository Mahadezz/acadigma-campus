import { listHolidays } from "@acadigma/db"
import { getSchoolSettings } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { todayIn } from "@acadigma/domain/time"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { HolidaysManager } from "./holidays-manager"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Holidays" }

/**
 * F-AC-11 Part 1 (D-202): the school's holidays, under settings. Every
 * staff member can read them (RLS `holidays_select`); only owner/admin
 * (`calendar.holiday.write`) see the add/remove controls. Lists this year
 * onward: 1 January of the school's current year, not the server's.
 */
export default async function HolidaysPage() {
  const ctx = await requireShell("school")
  const { t, locale } = await getMessages()
  const s = t.settings.calendar
  const client = await createClient()
  // "Today" is the school's day, in its own timezone (F-AC-11 §5.10).
  const settings = await getSchoolSettings(client, ctx)
  const today = todayIn(settings.ok ? settings.data.timezone : undefined)
  const from = `${today.slice(0, 4)}-01-01`
  const holidays = await listHolidays(ctx, client, from)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={s.title}
        description={s.description}
      />
      {holidays.ok ? (
        <HolidaysManager
          holidays={holidays.data}
          canWrite={can(ctx.role, "calendar.holiday.write")}
          today={today}
          locale={locale}
          t={s}
        />
      ) : (
        <InlineAlert tone="error">{holidays.error.message}</InlineAlert>
      )}
    </div>
  )
}
