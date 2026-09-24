import { z } from "zod"

import {
  cursorPageSchema,
  isoDateTimeSchema,
  paginated,
  uuidSchema,
} from "./common"

/**
 * Audit viewer contracts (F-ID-09 Parts 1-3). Every shape here mirrors a column of
 * `public.audit_events_view` (never the base table — see the migration's §10
 * comment) or an input to one of `apps/web/app/(school)/app/audit/actions.ts`'s
 * server actions.
 */

export const auditActorKindSchema = z.enum([
  "user",
  "platform_staff",
  "system",
  "webhook",
])
export type AuditActorKind = z.infer<typeof auditActorKindSchema>

export const auditSeveritySchema = z.enum(["info", "notable", "critical"])
export type AuditSeverity = z.infer<typeof auditSeveritySchema>

/** Every category the filter bar groups actions into (F-ID-09 §4.2). */
export const auditCategorySchema = z.enum([
  "account",
  "session",
  "profile",
  "preferences",
  "workspace",
  "school_profile",
  "member",
  "join_code",
  "label",
  "guardian",
  "document_request",
  "file",
  "personal_attendance",
  "diary_entry",
  "teacher_profile",
  "tenancy",
  "platform",
  "audit",
  "consent",
  "retention",
])
export type AuditCategory = z.infer<typeof auditCategorySchema>

// ---------------------------------------------------------------------------
// The action catalogue mirror (packages/domain/src/audit/catalog.ts is the
// source of truth in TypeScript; this schema just validates its shape and the
// shape of a row read back from `public.audit_action_catalog`).
// ---------------------------------------------------------------------------
export const auditActionCatalogEntrySchema = z.object({
  action: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  severity: auditSeveritySchema,
  sentenceEn: z.string().min(1),
  sentenceBn: z.string().min(1),
  isGeneric: z.boolean(),
})
export type AuditActionCatalogEntry = z.infer<
  typeof auditActionCatalogEntrySchema
>

// ---------------------------------------------------------------------------
// The row shape — what the repository hands back for one audit_events_view row,
// with actor/subject display names resolved (never raw profile rows).
// ---------------------------------------------------------------------------
export const auditEventSchema = z.object({
  id: z.string(),
  workspaceId: uuidSchema.nullable(),
  actorId: uuidSchema.nullable(),
  actorKind: auditActorKindSchema,
  /** Resolved display name, or null for a system/webhook actor. Never an email. */
  actorName: z.string().nullable(),
  action: z.string(),
  tableName: z.string().nullable(),
  rowId: uuidSchema.nullable(),
  subjectUserId: uuidSchema.nullable(),
  subjectName: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  changedFields: z.array(z.string()).nullable(),
  correlationId: uuidSchema.nullable(),
  requestIpHash: z.string().nullable(),
  userAgentFamily: z.string().nullable(),
  severity: auditSeveritySchema,
  createdAt: isoDateTimeSchema,
})
export type AuditEventDto = z.infer<typeof auditEventSchema>

/** Part 1-3 scope: the detail sheet reuses the same row shape as the list. */
export const auditEventDetailSchema = auditEventSchema
export type AuditEventDetailDto = z.infer<typeof auditEventDetailSchema>

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export const listAuditEventsInputSchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    actorId: uuidSchema.optional(),
    subjectUserId: uuidSchema.optional(),
    category: auditCategorySchema.optional(),
    severity: auditSeveritySchema.optional(),
    tableName: z.string().optional(),
    rowId: uuidSchema.optional(),
    /** Free-text search over the action and table name (§4.2). */
    q: z.string().trim().max(200).optional(),
  })
  .merge(cursorPageSchema)
export type ListAuditEventsInput = z.infer<typeof listAuditEventsInputSchema>

export const getAuditEventInputSchema = z.object({ id: z.string().min(1) })
export type GetAuditEventInput = z.infer<typeof getAuditEventInputSchema>

export const correlationInputSchema = z.object({
  correlationId: uuidSchema,
  limit: z.coerce.number().int().min(1).max(200).default(200),
})
export type CorrelationInput = z.infer<typeof correlationInputSchema>

export const recordHistoryInputSchema = z
  .object({
    tableName: z.string().min(1),
    rowId: uuidSchema,
  })
  .merge(cursorPageSchema)
export type RecordHistoryInput = z.infer<typeof recordHistoryInputSchema>

export const auditEventPageSchema = paginated(auditEventSchema)
export type AuditEventPage = z.infer<typeof auditEventPageSchema>
