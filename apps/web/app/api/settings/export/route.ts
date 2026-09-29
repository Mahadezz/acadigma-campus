import { NextResponse } from "next/server"

import { apiError, httpStatusForError } from "@acadigma/contracts"
import { exportWorkspaceData } from "@acadigma/db"
import { can } from "@acadigma/domain"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"
import { buildExportZip } from "@/lib/workspace-export"

/**
 * F-OP-07 Part 6 (D-211): "Export all data" — owner only, any plan, even a
 * read-only or archived school. A synchronous download (the D-211 cut of
 * W8's emailed 7-day link): every tenant table as the owner's own RLS returns
 * it, one CSV each, zipped. `public.log_workspace_export` checks owner-only
 * and the 3-a-day limit and writes the audit row before any table is read.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  const noStore = { "cache-control": "no-store" }
  // A cross-site page must not start a download (and spend the 3-a-day
  // quota) with the owner's cookies: the page's own fetch is same-origin.
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") {
    const error = apiError("forbidden", "Start the export from the Danger zone page.")
    return NextResponse.json(error, { status: 403, headers: noStore })
  }
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "settings.manage")) {
    const error = apiError(
      "forbidden",
      "Only the school's owner can export all data."
    )
    return NextResponse.json(error, {
      status: httpStatusForError(error.code),
      headers: noStore,
    })
  }

  const result = await exportWorkspaceData(ctx, await createClient())
  if (!result.ok) {
    return NextResponse.json(result.error, {
      status: httpStatusForError(result.error.code),
      headers: noStore,
    })
  }

  const zip = buildExportZip(result.data)
  const day = new Date().toISOString().slice(0, 10)
  return new Response(new Blob([new Uint8Array(zip)]), {
    headers: {
      ...noStore,
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="acadigma-export-${day}.zip"`,
    },
  })
}
