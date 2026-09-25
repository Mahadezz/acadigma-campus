import { z } from "zod"

import { isoDateTimeSchema, uuidSchema, workspaceIdSchema } from "../common"

/**
 * F-OP-03 Parts 1-2 — the run pipeline (`report_runs`), row shapes and the
 * one endpoint input this Part ships (`createReportRun`). Report *content*
 * schemas (`ReportCardParams`, `BulkReportCardParams`, ...) are not modelled
 * yet — every real kind depends on exams/marks (F-AC-0x), which is not built.
 * `report_kind` therefore has exactly one Postgres value so far, `'sample'`
 * (the run pipeline's own proof, spec §8 Part 2 demo: "enqueue a stub
 * report"); later Parts add their real kinds with `alter type ... add value`
 * plus a `ReportParams` union member each — additive, no migration on this
 * table's shape.
 */

// ---------------------------------------------------------------------------
// Enums — mirror public.report_kind / report_status / report_locale exactly
// (parity asserted in reports.test.ts).
// ---------------------------------------------------------------------------
export const reportKindSchema = z.enum(["sample"])
export type ReportKind = z.infer<typeof reportKindSchema>

export const reportStatusSchema = z.enum([
  "queued",
  "rendering",
  "ready",
  "failed",
  "expired",
])
export type ReportStatus = z.infer<typeof reportStatusSchema>

export const reportLocaleSchema = z.enum(["bn", "en"])
export type ReportLocale = z.infer<typeof reportLocaleSchema>

// ---------------------------------------------------------------------------
// createReportRun — the only params shape that exists yet.
// ---------------------------------------------------------------------------
export const sampleReportParamsSchema = z.object({ kind: z.literal("sample") })
export type SampleReportParams = z.infer<typeof sampleReportParamsSchema>

/** Discriminated union of one member today; the shape every later kind joins. */
export const reportRunInputSchema = z.object({
  params: sampleReportParamsSchema,
  locale: reportLocaleSchema,
})
export type ReportRunInput = z.infer<typeof reportRunInputSchema>

// ---------------------------------------------------------------------------
// report_runs — the row (§3.1). `params`/`errorCode`/`errorDetail` are the
// only nullable content fields this Part populates.
// ---------------------------------------------------------------------------
export const reportRunSchema = z.object({
  id: uuidSchema,
  workspaceId: workspaceIdSchema,
  kind: reportKindSchema,
  params: z.record(z.string(), z.unknown()),
  status: reportStatusSchema,
  fileId: uuidSchema.nullable(),
  pageCount: z.number().int().nullable(),
  itemCount: z.number().int().nullable(),
  locale: reportLocaleSchema,
  requestedBy: uuidSchema,
  requestedAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  durationMs: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorDetail: z.string().nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
})
export type ReportRun = z.infer<typeof reportRunSchema>
