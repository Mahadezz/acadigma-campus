"use server"

/**
 * F-OP-03 Parts 1-5 — `createReportRun` (§7). Three report kinds exist:
 * `'sample'` (the pipeline's own proof, D-205), `'report_card'` (D-206,
 * fixture-backed until F-AC-06 marks entry lands — see
 * `report-card-data.ts`'s seam comment), and `'report_card_bulk'` (D-207,
 * same fixture, one merged PDF per section per exam).
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
  type ReportCardBulkParams,
  type ReportCardParams,
  type ReportRun,
  type Result,
} from "@acadigma/contracts"
import {
  requireWritable,
  withServiceRole,
  type AcadigmaSupabaseClient,
  type WorkspaceContext,
} from "@acadigma/db"
import {
  createReportRun as createReportRunRepo,
  createReportRunItems,
  getReportRun,
  markReportRunFailed,
  markReportRunReady,
  markReportRunRendering,
} from "@acadigma/db/repositories/reports"
import { getSchoolProfile } from "@acadigma/db/repositories/settings"
import { can } from "@acadigma/domain"
import { renderHeaderLine } from "@acadigma/domain/settings"
import {
  renderPdfToBuffer,
  ReportCardDocument,
  SampleDocument,
} from "@acadigma/pdf"

import { resolveEntitledNavModules } from "@/lib/school-nav-entitlements"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

import { renderReportCardBulkPdf } from "./report-card-bulk"
import { getReportCardData } from "./report-card-data"
import { ACTION_FOR_KIND } from "./report-kind-action"

const REPORTS_PATH = "/app/reports"

/** Branding fields every template takes as plain props (`document-shell.tsx`'s
 * file header: this package never fetches its own data). Shared by every
 * render function below so a branding-read bug is fixed once. */
async function readBranding(
  service: Parameters<typeof getSchoolProfile>[0],
  ctx: WorkspaceContext
): Promise<{
  schoolName: string
  headerLines: string[]
  accentColor: string | null
  footerNote: string | null
}> {
  const profile = await getSchoolProfile(service, ctx)
  const schoolName = profile.ok ? (profile.data.fields.legal_name ?? "") : ""
  const headerLines = profile.ok
    ? [profile.data.branding.header_line_1, profile.data.branding.header_line_2]
        .filter((line): line is string => Boolean(line))
        .map((line) => renderHeaderLine(line, profile.data.fields))
    : []
  const accentColor = profile.ok ? profile.data.branding.accent : null
  const footerNote = profile.ok ? profile.data.branding.report_footer : null
  return { schoolName, headerLines, accentColor, footerNote }
}

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

      const branding = await readBranding(service, ctx)

      try {
        await renderPdfToBuffer(
          SampleDocument({
            locale: run.data.locale,
            ...branding,
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

/**
 * Renders one report card and moves the run to ready/failed. Same shape as
 * `renderSampleRun`, plus the one extra step this kind needs: resolving the
 * student's academic data through `getReportCardData` (the seam — see that
 * file's header comment) before the template can render at all. The seam
 * reads through the caller's own RLS client (`supabase`), never `service`.
 */
async function renderReportCardRun(
  runId: string,
  ctx: WorkspaceContext,
  params: ReportCardParams,
  supabase: AcadigmaSupabaseClient
): Promise<void> {
  const startedAt = Date.now()
  await withServiceRole(
    `report-runs: render report_card run ${runId}`,
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

      // Academic data through the CALLER's RLS client, not service role.
      const data = await getReportCardData(
        supabase,
        ctx,
        params.studentId,
        params.examId
      )
      if (!data.ok) {
        await markReportRunFailed(service, runId, "no_data", data.error.message)
        return
      }

      const branding = await readBranding(service, ctx)

      try {
        await renderPdfToBuffer(
          ReportCardDocument({
            locale: run.data.locale,
            ...branding,
            ...data.data,
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

/**
 * Renders every student in a section's merged report card PDF and moves the
 * run to ready/failed. Same shape as `renderReportCardRun` (D-206), plus:
 * the merge/duplex/ordering work happens in `renderReportCardBulkPdf`
 * (`report-card-bulk.ts`, shared with the download route), and a per-student
 * failure there is recorded as a `report_run_items` row rather than failing
 * the whole run (§4 W2) — written once, after rendering, under the same
 * service-role client (`report_run_items` has no INSERT grant for
 * `authenticated`, 300310's migration comment).
 */
async function renderReportCardBulkRun(
  runId: string,
  ctx: WorkspaceContext,
  params: ReportCardBulkParams,
  supabase: AcadigmaSupabaseClient
): Promise<void> {
  const startedAt = Date.now()
  await withServiceRole(
    `report-runs: render report_card_bulk run ${runId}`,
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

      const branding = await readBranding(service, ctx)

      const result = await renderReportCardBulkPdf(
        supabase, // the CALLER's RLS client, same rule as the single card
        ctx,
        params,
        run.data.locale,
        branding,
        new Date()
      )
      if (!result.ok) {
        await markReportRunFailed(
          service,
          runId,
          "no_data",
          result.error.message
        )
        return
      }

      await createReportRunItems(
        service,
        ctx,
        runId,
        result.data.items.map((item) =>
          item.status === "ready"
            ? {
                subjectId: item.studentId,
                status: "ready" as const,
                pageFrom: item.pageFrom,
                pageTo: item.pageTo,
              }
            : {
                subjectId: item.studentId,
                status: "failed" as const,
                errorDetail: item.errorDetail,
              }
        )
      )

      await markReportRunReady(
        service,
        runId,
        result.data.pageCount,
        Date.now() - startedAt,
        result.data.items.length
      )
    }
  )
}

export async function createReportRun(
  input: unknown
): Promise<Result<ReportRun, ApiError>> {
  const parsed = reportRunInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, ACTION_FOR_KIND[parsed.data.params.kind])) {
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
    if (parsed.data.params.kind === "sample") {
      await renderSampleRun(created.data.id, ctx)
    } else if (parsed.data.params.kind === "report_card") {
      await renderReportCardRun(
        created.data.id,
        ctx,
        parsed.data.params,
        supabase
      )
    } else {
      await renderReportCardBulkRun(
        created.data.id,
        ctx,
        parsed.data.params,
        supabase
      )
    }
    const refreshed = await getReportRun(supabase, ctx, created.data.id)
    revalidatePath(REPORTS_PATH)
    return refreshed.ok ? ok(refreshed.data) : created
  }

  return ok(created.data)
}
