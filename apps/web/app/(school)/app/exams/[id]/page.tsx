import { forbidden, notFound } from "next/navigation"

import { listClassTeacherOptions } from "@acadigma/db"
import { getExam } from "@acadigma/db/repositories/exams"
import { listPublishCandidates } from "@acadigma/db/repositories/results"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { schoolToday } from "../format"

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
  const candidates =
    can(ctx.role, "results.publish") && exam.data.status === "marks_locked"
      ? await listPublishCandidates(ctx, supabase, id)
      : null

  if (candidates && !candidates.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{candidates.error.message}</InlineAlert>
      </div>
    )
  }

  return (
    <ExamDetailView
      t={t.exams}
      locale={locale}
      exam={exam.data}
      canWrite={canWrite}
      canCompute={can(ctx.role, "results.compute")}
      canReadResults={can(ctx.role, "results.read")}
      publishCandidates={candidates?.ok ? candidates.data : null}
      teachers={teachers?.ok ? teachers.data : []}
      today={schoolToday()}
    />
  )
}
