import { forbidden } from "next/navigation"

import { listCustomLabels } from "@acadigma/db"
import { can } from "@acadigma/domain"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { LabelsView } from "./labels-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Custom labels" }

/**
 * F-ID-03 §4.8 / Part 6 (D-111): Custom labels — titles like "Vice-Principal"
 * over a base role. Owner and admin only; a label changes the title shown next
 * to a name, never what the person can do.
 */
export default async function LabelsPage() {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "labels.write")) forbidden()

  const { t } = await getMessages()
  const result = await listCustomLabels(ctx, await createClient())

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader title={t.labels.title} description={t.labels.lead} />
      {result.ok ? (
        <LabelsView t={t.labels} labels={result.data} />
      ) : (
        <InlineAlert tone="error">{t.labels.errors.generic}</InlineAlert>
      )}
    </div>
  )
}
