import { forbidden, notFound } from "next/navigation"

import { attendanceDateQuerySchema, uuidSchema } from "@acadigma/contracts"
import { getAttendanceDay, getRollCall } from "@acadigma/db"
import { can, formatIsoDate } from "@acadigma/domain"
import { editWindowOpen } from "@acadigma/domain/attendance"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { GenerateAttendanceRegisterButton } from "@/app/(school)/app/reports/generate-attendance-register-button"
import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { sectionLabel } from "../format"

import { RollCall } from "./roll-call"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Take attendance" }

/**
 * F-AC-03 §6 "Roll call" — demo cut (D-104). Every enrolled student starts
 * unmarked unless the day is already saved (D-22). Editable for any
 * teacher inside the edit window (substitutes cover, D-105) and for
 * owner/admin; read-only for everyone else. `public.save_attendance` enforces the same rules.
 */
export default async function RollCallPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "attendance.read") || ctx.role === "parent") forbidden()

  const { sectionId } = await params
  if (!uuidSchema.safeParse(sectionId).success) notFound()
  const raw = await searchParams
  const query = attendanceDateQuerySchema.safeParse({
    date: typeof raw.date === "string" ? raw.date : undefined,
  })

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const day = await getAttendanceDay(
    supabase,
    ctx,
    query.success ? query.data.date : undefined
  )
  if (!day.ok) {
    return (
      <InlineAlert tone="error">{t.attendance.roll.errors.generic}</InlineAlert>
    )
  }
  const section = day.data.sections.find((s) => s.sectionId === sectionId)
  if (!section) notFound()

  const students = await getRollCall(
    supabase,
    ctx,
    sectionId,
    day.data.date,
    section.session?.id ?? null
  )
  if (!students.ok) {
    return (
      <InlineAlert tone="error">{t.attendance.roll.errors.generic}</InlineAlert>
    )
  }

  const isManager = ctx.role === "owner" || ctx.role === "admin"
  const mayMark = can(ctx.role, "attendance.write")
  const inWindow =
    day.data.date <= day.data.today &&
    (isManager ||
      editWindowOpen(day.data.date, day.data.today, day.data.editWindowDays))

  return (
    <>
      <RollCall
        t={t.attendance.roll}
        locale={locale}
        sectionId={sectionId}
        title={sectionLabel(locale, section)}
        date={day.data.date}
        dateLabel={formatIsoDate(
          day.data.date,
          locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"
        )}
        isSchoolDay={day.data.isSchoolDay}
        students={students.data}
        sessionUpdatedAt={section.session?.updatedAt ?? null}
        readOnlyReason={!mayMark ? "cannotMark" : !inWindow ? "window" : null}
      />
      {can(ctx.role, "report.render.attendance_register") ? (
        <div className="mx-auto mt-4 max-w-xl">
          <GenerateAttendanceRegisterButton
            t={{
              generate: t.reports.generateAttendanceRegister,
              generating: t.reports.generating,
              error: t.reports.error,
            }}
            sectionId={sectionId}
            month={day.data.date.slice(0, 7)}
            locale={locale}
          />
        </div>
      ) : null}
    </>
  )
}
