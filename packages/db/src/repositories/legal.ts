/**
 * D-115: re-acceptance of the current legal documents. User-scoped like
 * `account-deletion.ts`: Terms/Privacy belong to the person, and the DPA's
 * school comes from a resolved `WorkspaceContext` in the caller, never from
 * the request. The write is `public.accept_legal_document`, which acts on
 * `auth.uid()` and re-checks ownership itself.
 */

import { apiError, err, ok } from "@acadigma/contracts"
import type { ApiError, Result } from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"

export type LegalDocument = "terms" | "privacy" | "dpa"

export type LegalAcceptanceRow = {
  document: string
  version: string
  workspaceId: string | null
}

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/**
 * The caller's own personal acceptances (Terms/Privacy), plus — when a
 * school is given — that school's DPA rows, whoever recorded them. RLS shows
 * a school's rows only to its owners and admins; the explicit filter keeps
 * platform staff (who see every row) to the same answer.
 */
export async function listLegalAcceptances(
  supabase: AcadigmaSupabaseClient,
  userId: string,
  schoolId: string | null
): Promise<Result<LegalAcceptanceRow[], ApiError>> {
  const mine = `and(user_id.eq.${userId},workspace_id.is.null)`
  const { data, error } = await supabase
    .from("legal_acceptances")
    .select("document, version, workspace_id")
    .or(
      schoolId
        ? `${mine},and(workspace_id.eq.${schoolId},document.eq.dpa)`
        : mine
    )
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((row) => ({
      document: row.document,
      version: row.version,
      workspaceId: row.workspace_id,
    }))
  )
}

export async function acceptLegalDocument(
  supabase: AcadigmaSupabaseClient,
  document: LegalDocument,
  version: string,
  workspaceId: string | null
): Promise<Result<null, ApiError>> {
  const { error } = await supabase.rpc("accept_legal_document", {
    p_document: document,
    p_version: version,
    ...(workspaceId ? { p_workspace_id: workspaceId } : {}),
  })
  if (!error) return ok(null)
  if (error.message === "FORBIDDEN") {
    return err(
      apiError("forbidden", "Only the school's owner can accept this.")
    )
  }
  if (error.message === "LEGAL_DOCUMENT_UNKNOWN") {
    return err(apiError("conflict", "The documents changed. Reload the page."))
  }
  return err(UNAVAILABLE)
}
