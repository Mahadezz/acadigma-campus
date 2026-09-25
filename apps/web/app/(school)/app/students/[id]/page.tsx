import { forbidden, notFound } from "next/navigation"

import { uuidSchema } from "@acadigma/contracts"
import { getRosterStudent, getStudentPrivate } from "@acadigma/db"
import { can, todayIn } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { StudentProfile } from "./student-profile"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Student" }

/**
 * F-AC-02 §6 "Student profile" — demo cut (D-103): the roster fields for
 * anyone who reads the roster; date of birth and guardians only when RLS
 * returns them (owner/admin, or the class teacher of the student's
 * section), otherwise a locked block (acceptance criterion 7).
 */
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "students.read") || ctx.role === "parent") forbidden()

  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()

  const { t: all, locale } = await getMessages()
  const t = all.students
  const supabase = await createClient()
  const [student, privateBlock] = await Promise.all([
    getRosterStudent(supabase, ctx, id),
    can(ctx.role, "students.read_sensitive")
      ? getStudentPrivate(supabase, ctx, id)
      : Promise.resolve({ ok: true as const, data: null }),
  ])

  if (!student.ok) {
    if (student.error.code === "not_found") notFound()
    return (
      <div className="mx-auto max-w-3xl">
        <InlineAlert tone="error">{t.errors.generic}</InlineAlert>
      </div>
    )
  }

  return (
    <StudentProfile
      t={t}
      locale={locale}
      student={student.data}
      details={privateBlock.ok ? privateBlock.data : null}
      privateError={!privateBlock.ok}
      today={todayIn()}
    />
  )
}
