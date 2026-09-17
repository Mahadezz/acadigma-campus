import { z } from "zod"

import { uuidSchema, workspaceIdSchema } from "./common"

/**
 * Contracts mirror of the notification event catalogue (F-ID-07 §5.1, §7,
 * `packages/domain/notifications/catalog.ts`). Kept here rather than derived from
 * the domain catalogue on purpose: `packages/contracts` has no dependency on
 * `packages/domain` (the dependency runs the other way), and this is the boundary
 * schema for what a caller of `app.notify()` — a server action, a trigger's calling
 * code, a job — is allowed to send. `packages/domain`'s catalogue test cross-checks
 * that this list stays in sync with the domain one.
 */
export const notificationCategorySchema = z.enum([
  "security",
  "people",
  "academics",
  "billing",
  "marketplace",
  "messages",
  "system",
])
export type NotificationCategory = z.infer<typeof notificationCategorySchema>

export const notificationPrioritySchema = z.enum(["low", "normal", "high"])
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>

export const notificationChannelSchema = z.enum(["in_app", "push", "email"])
export type NotificationChannel = z.infer<typeof notificationChannelSchema>

/** Every event id declared in the v1 catalogue (F-ID-07 §5.1). */
export const notificationEventIdSchema = z.enum([
  "auth.new_device_signin",
  "account.deletion_scheduled",
  "account.deletion_cancelled",
  "invite.received",
  "invite.accepted",
  "invite.declined",
  "invite.expired",
  "join_request.received",
  "join_request.approved",
  "join_request.rejected",
  "member.role_changed",
  "member.removed",
  "member.left",
  "workspace.ownership_transferred",
  "guardian.invited",
  "guardian.linked",
  "document_request.received",
  "document_request.approved",
  "document_request.declined",
  "document_request.revoked",
  "document_request.expiring",
  "attendance.low",
  "exam.reminder",
  "assignment.due_soon",
  "marks.published",
  "report_card.ready",
  "behaviour.logged",
  "cover.assigned",
  "print.ready",
  "print.failed",
  "ai_credits.low",
  "ai_credits.exhausted",
  "ai_credits.requested",
  "billing.trial_ending",
  "billing.payment_failed",
  "billing.invoice_ready",
  "marketplace.sale",
  "marketplace.listing_approved",
  "marketplace.changes_requested",
  "marketplace.rejected",
  "marketplace.payout_paid",
  "marketplace.refund_issued",
  "kyc.approved",
  "kyc.rejected",
  "hiring.application_received",
  "hiring.interview_scheduled",
  "hiring.offer_made",
  "message.mention",
  "message.dm",
  "announcement.published",
  "platform.broadcast",
  "support.grant_requested",
  "support.granted",
  "support.expired",
])
export type NotificationEventId = z.infer<typeof notificationEventIdSchema>

/**
 * The argument shape of `app.notify(...)` (F-ID-07 §4.1, §7) mirrored for TypeScript
 * callers. `category` is never accepted here — it is always derived from `event`
 * (§5.1) — and `data` is the untyped payload used to render `title`/`body` at read
 * time in the recipient's language (§5.2); per-event payload shapes are added by
 * each area's spec as it lands, not guessed here.
 */
export const notifyInputSchema = z.object({
  event: notificationEventIdSchema,
  recipientIds: z.array(uuidSchema).min(1).max(2000),
  workspaceId: workspaceIdSchema.nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  /** Required unless the catalogue's action_url template is `{url}` (platform.broadcast). */
  actionUrl: z.string().min(1).optional(),
  actorId: uuidSchema.nullable().optional(),
  subjectType: z.string().min(1).optional(),
  subjectId: uuidSchema.optional(),
  dedupeKey: z.string().min(1).optional(),
  groupKey: z.string().min(1).optional(),
})
export type NotifyInput = z.infer<typeof notifyInputSchema>
