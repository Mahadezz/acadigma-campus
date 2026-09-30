import "server-only"

import { cache } from "react"

import {
  listLegalAcceptances,
  type LegalAcceptanceRow,
  type LegalDocument,
} from "@acadigma/db/repositories/legal"

import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

import { LEGAL_DOCUMENTS } from "./documents"

export type LegalScope = {
  /** The school whose DPA the caller must accept: set only for its owner. */
  ownedSchoolId: string | null
}

/** A school's owner answers for its DPA; nobody else is asked (D-115 §3). */
export function legalScopeFor(ctx: {
  workspaceId: string
  workspaceType: string
  role: string
}): LegalScope {
  return {
    ownedSchoolId:
      ctx.workspaceType === "school" && ctx.role === "owner"
        ? ctx.workspaceId
        : null,
  }
}

/**
 * D-115: the documents whose CURRENT version the caller has not accepted.
 * Terms and Privacy are the person's own rows; the DPA is the school's, so
 * any row for the current version on that school counts.
 */
export function outstandingDocuments(
  rows: LegalAcceptanceRow[],
  scope: LegalScope
): LegalDocument[] {
  const has = (document: LegalDocument, workspaceId: string | null) =>
    rows.some(
      (r) =>
        r.document === document &&
        r.version === LEGAL_DOCUMENTS[document].version &&
        r.workspaceId === workspaceId
    )
  const out: LegalDocument[] = []
  if (!has("terms", null)) out.push("terms")
  if (!has("privacy", null)) out.push("privacy")
  if (scope.ownedSchoolId && !has("dpa", scope.ownedSchoolId)) out.push("dpa")
  return out
}

/**
 * The same, read for the signed-in caller. Cached per request (a layout and
 * its page both ask). A read error fails open and is logged (D-115 §8): the
 * gate never locks a school out of its own data over a transient error.
 */
export const getOutstandingDocuments = cache(
  async (
    userId: string,
    ownedSchoolId: string | null
  ): Promise<LegalDocument[]> => {
    const rows = await listLegalAcceptances(
      await createClient(),
      userId,
      ownedSchoolId
    )
    if (!rows.ok) {
      const log = await requestLogger({ route: "legal.outstanding" })
      log.warn({ code: rows.error.code }, "legal acceptance check skipped")
      return []
    }
    return outstandingDocuments(rows.data, { ownedSchoolId })
  }
)
