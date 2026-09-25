import { forbidden, notFound } from "next/navigation"

import { listClassTeacherOptions } from "@acadigma/db"
import { getExam } from "@acadigma/db/repositories/exams"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { ExamDetailView } from "./exam-detail-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Exam" }

/** F-AC-06 §6 "Exam detail" (demo cut, D-303): status and the papers. */
export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "exams.read")) forbidden()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const canWrite = can(ctx.role, "exams.write")
  const [exam, teachers] = await Promise.all([
    getExam(ctx, supabase, id),
    canWrite ? listClassTeacherOptions(supabase, ctx) : null,
  ])
  if (!exam.ok) {
    if (exam.error.code === "not_found") notFound()
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{exam.error.message}</InlineAlert>
      </div>
    )
  }

  return (
    <ExamDetailView
      t={t.exams}
      locale={locale}
      exam={exam.data}
      canWrite={canWrite}
      teachers={teachers?.ok ? teachers.data : []}
    />
  )
}
