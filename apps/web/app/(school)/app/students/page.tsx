import { forbidden } from "next/navigation"

import { studentSearchQuerySchema } from "@acadigma/contracts"
import { getClassesOverview, listRoster } from "@acadigma/db"
import { can } from "@acadigma/domain"
import { sectionDisplayName } from "@acadigma/domain/academic"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { StudentsView, type SectionOption } from "./students-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Students" }

/**
 * F-AC-02 §6 "Roster" — demo cut (D-103): one server-filtered page of the
 * roster with search and a class filter; owner/admin admit from a sheet.
 * Parents have their own portal (F-AC-10) and read nothing here.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "students.read") || ctx.role === "parent") forbidden()

  const raw = await searchParams
  const parsed = studentSearchQuerySchema.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    sectionId:
      typeof raw.section === "string" && raw.section ? raw.section : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  })
  const query = parsed.success ? parsed.data : { page: 1 }

  const { t, locale } = await getMessages()
  const supabase = await createClient()
  const overview = await getClassesOverview(supabase, ctx)
  const roster = overview.ok
    ? await listRoster(supabase, ctx, query, overview.data.year?.id ?? null)
    : overview

  if (!roster.ok || !overview.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <InlineAlert tone="error">{t.students.errors.generic}</InlineAlert>
      </div>
    )
  }

  const sections: SectionOption[] = overview.data.grades.flatMap((grade) =>
    grade.sections.map((section) => ({
      id: section.id,
      label: sectionDisplayName(
        locale === "bn" ? grade.nameBn : grade.name,
        section.name
      ),
    }))
  )

  return (
    <StudentsView
      t={t.students}
      locale={locale}
      students={roster.data.students}
      hasMore={roster.data.hasMore}
      query={query}
      sections={sections}
      canAdmit={can(ctx.role, "students.write")}
      canImport={can(ctx.role, "students.import")}
    />
  )
}
