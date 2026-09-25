import { forbidden } from "next/navigation"

import { listGradeScales } from "@acadigma/db/repositories/grading"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { GradeScaleEditor, SeedDefaultScale } from "./grade-scale-editor"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Grading" }

/** F-AC-06 §6 "Grade scale settings" — owner/admin (`settings.grade_scale.write`). */
export default async function GradingSettingsPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "settings.grade_scale.write")) forbidden()

  const { t } = await getMessages()
  const g = t.settings.grading
  const scales = await listGradeScales(ctx, await createClient())
  const scale = scales.ok ? scales.data[0] : undefined

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={g.title}
        description={g.description}
      />
      {!scales.ok ? (
        <InlineAlert tone="error">{scales.error.message}</InlineAlert>
      ) : scale ? (
        <GradeScaleEditor scale={scale} t={t.settings} />
      ) : (
        <SeedDefaultScale t={t.settings} />
      )}
    </div>
  )
}
