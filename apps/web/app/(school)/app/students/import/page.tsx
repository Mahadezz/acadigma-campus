import { forbidden } from "next/navigation"

import { uuidSchema } from "@acadigma/contracts"
import { getImportBatch } from "@acadigma/db"
import { can } from "@acadigma/domain"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { ImportView } from "./import-view"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Import students" }

/** The import action runs on this page; 2,000 rows take up to 20 calls. */
export const maxDuration = 60

/**
 * F-AC-02 §6 "Import" — demo cut (D-106): upload → preview → done. The
 * batch id is in the URL and the report is in the database, so the
 * preview and the result survive a reload.
 */
export default async function StudentImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireShell("school")
  if (!can(ctx.role, "students.import")) forbidden()

  const { batch: batchParam } = await searchParams
  const batchId = uuidSchema.safeParse(batchParam)
  const { t } = await getMessages()
  const batch = batchId.success
    ? await getImportBatch(await createClient(), ctx, batchId.data)
    : null

  return (
    <ImportView
      t={t.students.import}
      batch={batch?.ok ? batch.data : null}
      loadFailed={batch !== null && !batch.ok}
    />
  )
}
