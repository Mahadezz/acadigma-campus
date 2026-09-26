import { forbidden, notFound } from "next/navigation"

import { studentSearchQuerySchema, uuidSchema } from "@acadigma/contracts"
import {
  getAttendanceDay,
  getClassesOverview,
  getRollCall,
  listRoster,
} from "@acadigma/db"
import {
  getClassHub,
  getLatestSectionExam,
  isNotAssignedError,
  listSectionPapers,
} from "@acadigma/db/repositories/class-hub"
import { can, formatIsoDate } from "@acadigma/domain"
import { sectionDisplayName } from "@acadigma/domain/academic"
import { editWindowOpen } from "@acadigma/domain/attendance"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { ClassHubView } from "./class-hub-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Class" }

/**
 * F-ID-10 §4.5/§8 Part 3 — the class hub. Every read is scoped to this one
 * section, through the same repositories/RLS the full app already uses
 * (§7): `getAttendanceDay`/`getRollCall` (Attendance), `listSectionPapers`
 * (Marks), `listRoster` (Students), `getLatestSectionExam` (Print). The
 * hub's own gate (`getClassHub` → `NOT_ASSIGNED`) is stricter than any one
 * tab's permission check (§2 footnote ²/³) — a teacher not assigned to this
 * section sees neither the header nor any tab's data.
 */
export default async function ClassHubPage({
  params,
}: {
  params: Promise<{ sectionId: string }>
}) {
  const ctx = await requireShell("school")
  // §2's role table: only owner/admin/teacher ever see a class block or a
  // hub — staff has no classes (D-403 §2 note 4) and parents use the family
  // portal, so neither role has a hub to open.
  if (ctx.role !== "owner" && ctx.role !== "admin" && ctx.role !== "teacher") {
    forbidden()
  }

  const { sectionId } = await params
  if (!uuidSchema.safeParse(sectionId).success) notFound()

  const { t, locale } = await getMessages()
  const s = t.basicMode.classHub
  const supabase = await createClient()

  const hub = await getClassHub(supabase, ctx, sectionId)
  if (!hub.ok) {
    if (isNotAssignedError(hub.error)) {
      return (
        <EmptyState
          title={s.notAssignedTitle}
          description={s.notAssignedDescription}
        />
      )
    }
    if (hub.error.code === "not_found") notFound()
    return <InlineAlert tone="error">{s.errorGeneric}</InlineAlert>
  }

  const [day, papers, overview, latestExam] = await Promise.all([
    getAttendanceDay(supabase, ctx),
    listSectionPapers(supabase, ctx, sectionId),
    getClassesOverview(supabase, ctx),
    getLatestSectionExam(supabase, ctx, sectionId),
  ])

  const attendanceSection = day.ok
    ? day.data.sections.find((sec) => sec.sectionId === sectionId)
    : undefined
  const rollCall =
    day.ok && attendanceSection
      ? await getRollCall(
          supabase,
          ctx,
          sectionId,
          day.data.date,
          attendanceSection.session?.id ?? null
        )
      : null

  const yearId = overview.ok ? (overview.data.year?.id ?? null) : null
  const rosterQuery = studentSearchQuerySchema.parse({
    sectionId,
    page: 1,
  })
  const roster = await listRoster(supabase, ctx, rosterQuery, yearId)

  const isManager = ctx.role === "owner" || ctx.role === "admin"
  const mayMarkAttendance = can(ctx.role, "attendance.write")
  const inWindow =
    day.ok &&
    attendanceSection &&
    day.data.date <= day.data.today &&
    (isManager ||
      editWindowOpen(day.data.date, day.data.today, day.data.editWindowDays))

  const gradeName =
    locale === "bn" ? hub.data.section.gradeNameBn : hub.data.section.gradeName
  const title = sectionDisplayName(gradeName, hub.data.section.name)

  return (
    <ClassHubView
      t={t}
      locale={locale}
      sectionId={sectionId}
      title={title}
      studentCount={hub.data.studentCount}
      tabs={hub.data.tabs}
      month={day.ok ? day.data.today.slice(0, 7) : null}
      attendance={
        day.ok && attendanceSection && rollCall?.ok
          ? {
              date: day.data.date,
              dateLabel: formatIsoDate(
                day.data.date,
                locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"
              ),
              isSchoolDay: day.data.isSchoolDay,
              students: rollCall.data,
              sessionUpdatedAt: attendanceSection.session?.updatedAt ?? null,
              readOnlyReason: !mayMarkAttendance
                ? "cannotMark"
                : !inWindow
                  ? "window"
                  : null,
            }
          : null
      }
      papers={papers.ok ? papers.data : []}
      students={roster.ok ? roster.data.students : []}
      latestExam={latestExam.ok ? latestExam.data : null}
    />
  )
}
