import { z } from "zod"

import { isoDateTimeSchema, uuidSchema, workspaceIdSchema } from "../common"

import { attendanceRegisterParamsSchema } from "./attendance-register"
import { markSheetParamsSchema } from "./mark-sheet"
import {
  reportCardBulkParamsSchema,
  reportCardParamsSchema,
} from "./report-card"

/**
 * F-OP-03 Parts 1-2 — the run pipeline (`report_runs`), row shapes and the
 * endpoint input this Part ships (`createReportRun`). Report *content*
 * schemas beyond `report_card`/`report_card_bulk` are not modelled yet —
 * every remaining real kind depends on exams/marks (F-AC-0x), which is not
 * built. `report_kind` started with exactly one Postgres value, `'sample'`
 * (the run pipeline's own proof, spec §8 Part 2 demo: "enqueue a stub
 * report"); Part 3 (D-206) adds `'report_card'`; Part 5 (D-207) adds
 * `'report_card_bulk'` — each with `alter type ... add value` plus its own
 * params union member, additive, no migration on this table's shape.
 */

// ---------------------------------------------------------------------------
// Enums — mirror public.report_kind / report_status / report_locale exactly
// (parity asserted in reports.test.ts).
// ---------------------------------------------------------------------------
export const reportKindSchema = z.enum([
  "sample",
  "report_card",
  "report_card_bulk",
  "attendance_register",
  "mark_sheet",
])
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
// createReportRun — one params shape per kind, discriminated on `kind`.
// ---------------------------------------------------------------------------
export const sampleReportParamsSchema = z.object({ kind: z.literal("sample") })
export type SampleReportParams = z.infer<typeof sampleReportParamsSchema>

export const reportRunParamsSchema = z.discriminatedUnion("kind", [
  sampleReportParamsSchema,
  reportCardParamsSchema,
  reportCardBulkParamsSchema,
  attendanceRegisterParamsSchema,
  markSheetParamsSchema,
])
export type ReportRunParams = z.infer<typeof reportRunParamsSchema>

export const reportRunInputSchema = z.object({
  params: reportRunParamsSchema,
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
