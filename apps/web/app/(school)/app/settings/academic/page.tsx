import { forbidden } from "next/navigation"

import {
  getExamWeights,
  listAcademicYears,
  listTerms,
} from "@acadigma/db/repositories/academic-years"
import { listExams } from "@acadigma/db/repositories/exams"
import { getSchoolSettings } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { DEFAULT_ACADEMIC_SETTINGS } from "@acadigma/domain/settings"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { AcademicManager } from "./academic-manager"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Academic settings" }

/**
 * F-OP-07 Part 2 (D-210) §4 W3, §6 "Academic": years, terms, exam weighting
 * and the pass-mark/GPA/rank rules. Owner/admin only
 * (`workspace.settings.write`); the selected year travels in `?year=` so
 * switching years is an ordinary server re-render, the same shape the
 * attendance register page already uses for its own picker.
 */
export default async function AcademicSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "workspace.settings.write")) forbidden()

  const { t } = await getMessages()
  const a = t.settings.academic
  const client = await createClient()

  const years = await listAcademicYears(ctx, client)
  if (!years.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <SubPageHeader
          backLabel={t.settings.back}
          title={a.title}
          description={a.description}
        />
        <InlineAlert tone="error">{years.error.message}</InlineAlert>
      </div>
    )
  }

  const raw = await searchParams
  const requested = typeof raw.year === "string" ? raw.year : undefined
  const selectedYear =
    years.data.find((y) => y.id === requested) ??
    years.data.find((y) => y.isCurrent) ??
    years.data[0] ??
    null

  const [terms, weights, exams, settings] = await Promise.all([
    selectedYear
      ? listTerms(ctx, client, selectedYear.id)
      : Promise.resolve({ ok: true as const, data: [] }),
    selectedYear
      ? getExamWeights(ctx, client, selectedYear.id)
      : Promise.resolve({ ok: true as const, data: {} }),
    selectedYear
      ? listExams(ctx, client, selectedYear.id)
      : Promise.resolve({ ok: true as const, data: [] }),
    getSchoolSettings(client, ctx),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={a.title}
        description={a.description}
      />
      <AcademicManager
        years={years.data}
        selectedYearId={selectedYear?.id ?? null}
        terms={terms.ok ? terms.data : []}
        weights={weights.ok ? weights.data : {}}
        exams={exams.ok ? exams.data : []}
        academicSettings={
          settings.ok ? settings.data.academicSettings : DEFAULT_ACADEMIC_SETTINGS
        }
        t={a}
      />
    </div>
  )
}
