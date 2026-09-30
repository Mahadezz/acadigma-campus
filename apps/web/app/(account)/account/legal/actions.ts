"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import {
  acceptLegalDocumentsInputSchema,
  apiError,
  apiErrorFromZod,
  err,
  ok,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { resolveWorkspaceContext } from "@acadigma/db"
import {
  acceptLegalDocument,
  listLegalAcceptances,
} from "@acadigma/db/repositories/legal"

import { LEGAL_DOCUMENTS } from "@/lib/legal/documents"
import { legalScopeFor, outstandingDocuments } from "@/lib/legal/outstanding"
import { createClient } from "@/lib/supabase/server"

/**
 * D-115: record the caller's acceptance of the documents the screen showed.
 * Parse → signed in → the outstanding set, recomputed here from the
 * resolved workspace (never from the request) → it must be exactly what was
 * shown, at the current versions → one `accept_legal_document` per
 * document. No `requireWritable`: `legal_acceptances` is exempt (D-300), so
 * a read-only or archived school's owner can still accept.
 */
export async function acceptLegalDocuments(
  raw: unknown
): Promise<Result<{ redirectTo: string }, ApiError>> {
  const parsed = acceptLegalDocumentsInputSchema.safeParse(raw)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return err(apiError("unauthenticated", "Please sign in to continue."))
  }

  const ctx = await resolveWorkspaceContext(supabase, await headers())
  const { ownedSchoolId } = ctx.ok
    ? legalScopeFor(ctx.data)
    : { ownedSchoolId: null }

  const rows = await listLegalAcceptances(supabase, user.id, ownedSchoolId)
  if (!rows.ok) return rows
  const outstanding = outstandingDocuments(rows.data, { ownedSchoolId })

  const sent = Object.keys(parsed.data).sort()
  const changed =
    sent.join() !== [...outstanding].sort().join() ||
    outstanding.some((d) => parsed.data[d] !== LEGAL_DOCUMENTS[d].version)
  if (changed) {
    return err(apiError("conflict", "The documents changed. Reload the page."))
  }

  for (const document of outstanding) {
    const accepted = await acceptLegalDocument(
      supabase,
      document,
      LEGAL_DOCUMENTS[document].version,
      document === "dpa" ? ownedSchoolId : null
    )
    if (!accepted.ok) return accepted
  }

  revalidatePath("/", "layout")
  return ok({ redirectTo: "/app" })
}
