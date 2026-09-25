"use server"

/**
 * F-OP-03 Parts 1-2 — `createReportRun` (§7). The only report kind that
 * exists yet is `'sample'` (the pipeline's own proof; see the migration and
 * `packages/pdf/src/templates/sample.tsx`).
 *
 * Shape, every write action (CLAUDE.md, ARCHITECTURE §5): parse -> resolve
 * context -> policy (`can`) -> plan entitlement -> `requireWritable` (D-300)
 * -> repository -> render -> return the canonical row.
 *
 * The render step runs under `withServiceRole` (ARCHITECTURE §3 rule 6):
 * `report_runs` has no client UPDATE policy at all (migration comment) — only
 * the pipeline itself may move a run from `queued` to `ready`/`failed`.
 * Branding is still read through the CALLER's own RLS-scoped client first
 * (school_profiles' SELECT policy already allows any active member to read
 * it) — service role is reserved for the one thing only the pipeline may do.
 */
import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  err,
  ok,
  planReadOnlyApiError,
  reportRunInputSchema,
  type ApiError,
  type ReportRun,
  type Result,
} from "@acadigma/contracts"
import {
  requireWritable,
  withServiceRole,
  type WorkspaceContext,
} from "@acadigma/db"
import {
  createReportRun as createReportRunRepo,
  getReportRun,
  markReportRunFailed,
  markReportRunReady,
  markReportRunRendering,
} from "@acadigma/db/repositories/reports"
import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { renderHeaderLine } from "@acadigma/domain/settings"
import { renderPdfToBuffer, SampleDocument } from "@acadigma/pdf"

import { resolveEntitledNavModules } from "@/lib/school-nav-entitlements"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const REPORTS_PATH = "/app/reports"

/**
 * Renders the sample document and moves the run to ready/failed. Never
 * throws. `ctx` is the real request context — service role only changes
 * which Supabase client is used (bypassing RLS for the status transition),
 * not who the caller is; `workspaceId` is the only field either repository
 * call actually reads.
 */
async function renderSampleRun(
  runId: string,
  ctx: WorkspaceContext
): Promise<void> {
  const startedAt = Date.now()
  await withServiceRole(
    `report-runs: render sample run ${runId}`,
    async (service) => {
      const rendering = await markReportRunRendering(service, runId)
      if (!rendering.ok) return

      const run = await getReportRun(service, ctx, runId)
      if (!run.ok) {
        await markReportRunFailed(
          service,
          runId,
          "run_not_found",
          run.error.message
        )
        return
      }

      const profile = await getSchoolProfile(service, ctx)
      const schoolName = profile.ok
        ? (profile.data.fields.legal_name ?? "")
        : ""
      const headerLines = profile.ok
        ? [
            profile.data.branding.header_line_1,
            profile.data.branding.header_line_2,
          ]
            .filter((line): line is string => Boolean(line))
            .map((line) => renderHeaderLine(line, profile.data.fields))
        : []
      const accentColor = profile.ok ? profile.data.branding.accent : null
      const footerNote = profile.ok ? profile.data.branding.report_footer : null

      try {
        await renderPdfToBuffer(
          SampleDocument({
            locale: run.data.locale,
            schoolName,
            headerLines,
            accentColor,
            footerNote,
            generatedAt: new Date(),
          })
        )
        await markReportRunReady(service, runId, 1, Date.now() - startedAt)
      } catch (renderError) {
        await markReportRunFailed(
          service,
          runId,
          "render_error",
          renderError instanceof Error
            ? renderError.message
            : "Unknown render error"
        )
      }
    }
  )
}

export async function createReportRun(
  input: unknown
): Promise<Result<ReportRun, ApiError>> {
  const parsed = reportRunInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "report.render.sample")) {
    return err(apiError("forbidden", "You cannot generate reports here."))
  }

  const supabase = await createClient()
  const entitledModules = await resolveEntitledNavModules(ctx, supabase)
  if (!entitledModules.includes("reports")) {
    return err(
      apiError(
        "payment_required",
        "Reports needs the Starter plan or above. Ask the owner to upgrade."
      )
    )
  }

  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const created = await createReportRunRepo(supabase, ctx, {
    kind: parsed.data.params.kind,
    params: parsed.data.params,
    locale: parsed.data.locale,
  })
  if (!created.ok) return created

  // Only kick a render for a run this call actually created (status still
  // 'queued'); an idempotent replay of an existing ready/rendering run must
  // not re-render (§9 AC19).
  if (created.data.status === "queued") {
    await renderSampleRun(created.data.id, ctx)
    const refreshed = await getReportRun(supabase, ctx, created.data.id)
    revalidatePath(REPORTS_PATH)
    return refreshed.ok ? ok(refreshed.data) : created
  }

  return ok(created.data)
}
