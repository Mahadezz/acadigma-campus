import { forbidden } from "next/navigation"

import { getClassesOverview } from "@acadigma/db"
import { can } from "@acadigma/domain"
import { sectionDisplayName } from "@acadigma/domain/academic"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { AllClassesView } from "./all-classes-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "All classes" }

/**
 * F-ID-10 §4.4 footnote ¹ / AC16 — the owner/admin "All classes" block's
 * destination: a searchable list of every live section, ordered the same
 * grade-then-name way `attendance_day`/`getClassesOverview` already sort.
 * Reuses `getClassesOverview` (F-AC-01, already gated on
 * `academics.structure.read`) rather than a new repository function — this
 * Part needs names and ids, nothing `getClassesOverview` does not already
 * return (D-405).
 */
export default async function AllClassesPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "academics.structure.read")) forbidden()

  const { t, locale } = await getMessages()
  const s = t.basicMode.allClasses
  const overview = await getClassesOverview(await createClient(), ctx)
  if (!overview.ok) {
    return (
      <div className="mx-auto max-w-md">
        <InlineAlert tone="error">{t.classes.errors.generic}</InlineAlert>
      </div>
    )
  }

  const rows = overview.data.grades.flatMap((grade) =>
    grade.sections.map((section) => ({
      sectionId: section.id,
      name: sectionDisplayName(
        locale === "bn" ? grade.nameBn : grade.name,
        section.name
      ),
    }))
  )

  return (
    <div className="mx-auto max-w-md">
      <AllClassesView
        rows={rows}
        t={{
          title: s.title,
          searchLabel: s.searchLabel,
          searchPlaceholder: s.searchPlaceholder,
          searchEmpty: s.searchEmpty,
        }}
      />
    </div>
  )
}
