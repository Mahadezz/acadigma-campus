import { listAuditEventsInputSchema } from "@acadigma/contracts/audit"
import {
  getAttendanceDay,
  getDashboardSummary,
  listAuditEvents,
} from "@acadigma/db/repositories"
import { getSchoolSettings } from "@acadigma/db/repositories/settings"
import { schoolDayRate } from "@acadigma/domain/attendance"
import { renderAuditSentence } from "@acadigma/domain/audit"
import {
  buildSetupChecklist,
  isCuratedAuditAction,
  trialDaysLeft,
} from "@acadigma/domain/dashboard"
import { can } from "@acadigma/domain/permissions"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import type { Messages } from "@/lib/i18n"
import { IMPLEMENTED_NAV_ROUTES } from "@/lib/implemented-routes"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { DashboardView } from "./dashboard-view"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard",
}

/**
 * The school's "today" dashboard (D-400). Every number is a real count from
 * `getDashboardSummary`; attendance and results are empty slots until the
 * Parts that record them ship. View-only: this page never writes.
 *
 * It re-runs the shell gate rather than trusting the layout: a page that
 * states its own requirement cannot be moved out from under its guard by a
 * client-side navigation that skips the layout (PR #30 review).
 */
export default async function DashboardPage() {
  const ctx = await requireShell("school")
  const { locale, t } = await getMessages()
  const d = t.dashboard
  const client = await createClient()

  const isManager = ctx.role === "owner" || ctx.role === "admin"
  const canReadAudit = can(ctx.role, "audit.read")

  const canReadAttendance =
    can(ctx.role, "attendance.read") && ctx.role !== "parent"
  const [summary, audit, day, settings] = await Promise.all([
    getDashboardSummary(ctx, client),
    canReadAudit
      ? listAuditEvents(
          ctx,
          client,
          listAuditEventsInputSchema.parse({ limit: 30 })
        )
      : null,
    canReadAttendance ? getAttendanceDay(client, ctx) : null,
    canReadAttendance ? getSchoolSettings(client, ctx) : null,
  ])

  if (!summary.ok) {
    return <InlineAlert tone="error">{d.loadError}</InlineAlert>
  }
  const s = summary.data
  // Western digits in both languages (DESIGN-SYSTEM §1.6).
  const numberLocale = locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"

  const dateLabel = new Intl.DateTimeFormat(numberLocale, {
    timeZone: s.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date())

  const when = new Intl.DateTimeFormat(numberLocale, {
    timeZone: s.timezone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <DashboardView
      t={d}
      dateLabel={dateLabel}
      schoolName={s.headerLine1 ?? s.schoolName}
      subtitle={s.headerLine2}
      isManager={isManager}
      plan={{
        label: ctx.plan ?? d.plan.noPlan,
        trial: trialLabel(d, trialDaysLeft(s.trialEndsAt, s.timezone)),
        readOnly: s.accessMode === "read_only",
      }}
      attendance={attendanceSlot(d, numberLocale, day, settings)}
      membersByRole={s.membersByRole}
      staffRecordCount={s.staffRecordCount}
      checklist={buildSetupChecklist({
        hasSchoolProfile: Boolean(s.headerLine1) || s.hasLogo,
        teacherCount: s.membersByRole.teacher,
        staffRecordCount: s.staffRecordCount,
        currentAcademicYearCount: s.currentAcademicYearCount,
        gradeLevelCount: s.gradeLevelCount,
        // No student table exists yet (F-AC-02).
        studentCount: 0,
      }).map((step) => ({
        ...step,
        href: IMPLEMENTED_NAV_ROUTES.has(step.href) ? step.href : null,
      }))}
      activity={
        // Hidden, not shown empty, when the caller may not read the trail or
        // it failed to load — "nothing has changed" would be a false claim.
        audit?.ok
          ? audit.data.items
              .filter((event) => isCuratedAuditAction(event.action))
              .slice(0, 5)
              .map((event) => ({
                id: event.id,
                sentence: renderAuditSentence(event.action, locale, {
                  actor: event.actorName,
                  subject: event.subjectName,
                }),
                when: when.format(new Date(event.createdAt)),
              }))
          : null
      }
    />
  )
}

/** F-AC-03 (D-104): "92.5 %" and "3 of 5 classes marked", or null until a
 * class is marked today. */
function attendanceSlot(
  d: Messages["dashboard"],
  numberLocale: string,
  day: Awaited<ReturnType<typeof getAttendanceDay>> | null,
  settings: Awaited<ReturnType<typeof getSchoolSettings>> | null
): { marked: string; rate: string } | null {
  if (!day?.ok) return null
  const marked = day.data.sections.flatMap((s) =>
    s.session ? [s.session] : []
  )
  const policy = settings?.ok
    ? settings.data.attendancePolicy
    : { late_counts_present: true, half_day_counts_present: true }
  const rate = schoolDayRate(marked, policy)
  if (rate === null) return null
  const n = new Intl.NumberFormat(numberLocale)
  return {
    rate: d.attendance.rate.replace("{rate}", n.format(rate)),
    marked: d.attendance.marked
      .replace("{done}", n.format(marked.length))
      .replace("{total}", n.format(day.data.sections.length)),
  }
}

function trialLabel(
  d: Messages["dashboard"],
  days: number | null
): string | null {
  if (days === null) return null
  if (days < 0) return d.plan.trialEnded
  if (days === 0) return d.plan.trialLastDay
  if (days === 1) return d.plan.trialOneDayLeft
  return d.plan.trialDaysLeft.replace("{days}", String(days))
}
