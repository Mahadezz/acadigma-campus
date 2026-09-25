import { forbidden } from "next/navigation"

import {
  getClassesOverview,
  listClassTeacherOptions,
  listSubjects,
} from "@acadigma/db"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { ClassesView } from "./classes-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Classes" }

/**
 * F-AC-01 §6 "Classes (grades)" — demo cut (D-102): the current year's
 * grades with their sections, and the subject catalogue. Everyone but
 * parents reads; owner/admin write.
 */
export default async function ClassesPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "academics.structure.read")) forbidden()

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const canWriteSections = can(ctx.role, "academics.section.write")
  const canWriteSubjects = can(ctx.role, "academics.subject.write")

  const [overview, subjects, teachers] = await Promise.all([
    getClassesOverview(supabase, ctx),
    listSubjects(supabase, ctx),
    canWriteSections
      ? listClassTeacherOptions(supabase, ctx)
      : Promise.resolve({ ok: true as const, data: [] }),
  ])

  if (!overview.ok || !subjects.ok || !teachers.ok) {
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{t.classes.errors.generic}</InlineAlert>
      </div>
    )
  }

  return (
    <ClassesView
      t={t.classes}
      locale={locale}
      overview={overview.data}
      subjects={subjects.data}
      teachers={teachers.data}
      canWriteSections={canWriteSections}
      canWriteSubjects={canWriteSubjects}
    />
  )
}
