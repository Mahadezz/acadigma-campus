import { forbidden } from "next/navigation"

import { getClassesOverview, listSubjects } from "@acadigma/db"
import { listExams } from "@acadigma/db/repositories/exams"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { ExamsView } from "./exams-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Exams" }

/** F-AC-06 §6 "Exams list" (demo cut, D-303): the current year's exams. */
export default async function ExamsPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "exams.read")) forbidden()

  const { t } = await getMessages()
  const supabase = await createClient()
  const [overview, subjects] = await Promise.all([
    getClassesOverview(supabase, ctx),
    listSubjects(supabase, ctx),
  ])
  if (!overview.ok || !subjects.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{t.exams.error}</InlineAlert>
      </div>
    )
  }
  const year = overview.data.year
  const exams = year ? await listExams(ctx, supabase, year.id) : null
  if (exams && !exams.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{exams.error.message}</InlineAlert>
      </div>
    )
  }

  return (
    <ExamsView
      t={t.exams}
      year={year}
      grades={overview.data.grades}
      subjects={subjects.data}
      exams={exams?.ok ? exams.data : []}
      canWrite={can(ctx.role, "exams.write")}
    />
  )
}
