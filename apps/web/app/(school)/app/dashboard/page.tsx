import { listAuditEventsInputSchema } from "@acadigma/contracts/audit"
import { getDashboardSummary, listAuditEvents } from "@acadigma/db/repositories"
import { renderAuditSentence } from "@acadigma/domain/audit"
import { buildSetupChecklist, trialDaysLeft } from "@acadigma/domain/dashboard"
import { can } from "@acadigma/domain/permissions"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { IMPLEMENTED_NAV_ROUTES } from "@/lib/implemented-routes"
import type { Messages } from "@/lib/i18n"
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

  const [summary, audit] = await Promise.all([
    getDashboardSummary(ctx, client),
    canReadAudit
      ? listAuditEvents(
          ctx,
          client,
          listAuditEventsInputSchema.parse({ limit: 5 })
        )
      : null,
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
      membersByRole={s.membersByRole}
      staffRecordCount={s.staffRecordCount}
      checklist={buildSetupChecklist({
        hasSchoolProfile: Boolean(s.headerLine1) || s.hasLogo,
        teacherCount: s.membersByRole.teacher,
        staffRecordCount: s.staffRecordCount,
        // No academic-year or student table exists yet (F-AC-01, F-AC-02).
        hasAcademicYear: false,
        studentCount: 0,
      }).map((step) => ({
        ...step,
        href: IMPLEMENTED_NAV_ROUTES.has(step.href) ? step.href : null,
      }))}
      activity={
        // Hidden, not shown empty, when the caller may not read the trail or
        // it failed to load — "nothing has changed" would be a false claim.
        audit?.ok
          ? audit.data.items.map((event) => ({
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
