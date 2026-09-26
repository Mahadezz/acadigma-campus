import { forbidden, notFound } from "next/navigation"

import { uuidSchema } from "@acadigma/contracts"
import { getMarkSheet } from "@acadigma/db/repositories/marks"
import { can } from "@acadigma/domain"
import { outsideEntryWindow } from "@acadigma/domain/academic"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { schoolToday } from "../../exams/format"

import { MarksEntry, type ReadOnlyReason } from "./marks-entry"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Enter marks" }

/**
 * F-AC-06 §6 "Marks entry" (Part 3 demo cut, D-304). Editable for an
 * owner/admin, the paper's teacher and the class teacher while the exam is
 * in marks entry and the paper is not locked; `public.save_marks` enforces
 * the same rules. Another subject's teacher sees no marks (RLS).
 */
export default async function MarksEntryPage({
  params,
}: {
  params: Promise<{ examSubjectId: string }>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "marks.read") || ctx.role === "parent") forbidden()
  const { examSubjectId } = await params
  if (!uuidSchema.safeParse(examSubjectId).success) notFound()

  const { t, locale } = await getMessages()
  const sheet = await getMarkSheet(ctx, await createClient(), examSubjectId)
  if (!sheet.ok) {
    if (sheet.error.code === "not_found") notFound()
    return <InlineAlert tone="error">{t.marks.errors.generic}</InlineAlert>
  }
  const s = sheet.data
  const isAdmin = ctx.role === "owner" || ctx.role === "admin"
  const today = schoolToday()
  const outside = outsideEntryWindow(
    { opensOn: s.entryOpensOn, closesOn: s.entryClosesOn },
    today
  )

  const readOnlyReason: ReadOnlyReason | null = !s.canEnter
    ? ctx.role === "teacher"
      ? "notAssigned"
      : "viewOnly"
    : s.examStatus !== "marks_entry"
      ? "closed"
      : s.paperStatus === "locked"
        ? "locked"
        : outside && !isAdmin
          ? "window"
          : null

  return (
    <MarksEntry
      t={t.marks}
      locale={locale}
      sheet={readOnlyReason === "notAssigned" ? { ...s, rows: [] } : { ...s }}
      readOnlyReason={readOnlyReason}
      lateReasonRequired={readOnlyReason === null && outside}
      canSubmit={
        s.canSubmit &&
        s.examStatus === "marks_entry" &&
        s.paperStatus !== "locked"
      }
    />
  )
}
