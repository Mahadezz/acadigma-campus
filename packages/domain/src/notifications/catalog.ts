/**
 * The v1 notification event taxonomy (F-ID-07 §5.1, PRODUCT-DECISIONS §1.11).
 *
 * This is the skeleton half of F-ID-07 Part 1: the typed catalogue and the CI
 * parity test (`scripts/check-notification-catalog-parity.mjs`) that keeps it from
 * drifting from the code that will eventually call `app.notify()` and from the
 * translated strings a recipient actually reads. It intentionally does not include
 * the `notifications` table migration, `app.notify`, or RLS — those are full-Part-1
 * DB work that needs a live Postgres to test against pgTAP (none is available in
 * this session; see docs/test-reports/2026-09-17-M0-gates.md) and are left for the
 * session that builds the rest of F-ID-07 Part 1.
 *
 * Event names are `{domain}.{event}`, lowercase, dot-separated, stable forever —
 * they are a public contract between areas (§5.1). `category` is always DERIVED
 * from the event here; nothing downstream should ever accept a category as input.
 */

export const NOTIFICATION_CATEGORIES = [
  "security",
  "people",
  "academics",
  "billing",
  "marketplace",
  "messages",
  "system",
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export const NOTIFICATION_PRIORITIES = ["low", "normal", "high"] as const
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number]

export const NOTIFICATION_CHANNELS = ["in_app", "push", "email"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export type NotificationCatalogEntry = {
  event: string
  category: NotificationCategory
  /**
   * The priority used when the event fires. `platform.broadcast` is the one row
   * where the emitting call sets the real priority per §4.6; `normal` here is its
   * floor, not a claim that every broadcast is normal.
   */
  priority: NotificationPriority
  /** True only for `platform.broadcast` — the caller decides the real priority. */
  priorityVaries?: true
  /** Channels a fresh `notification_preferences` row defaults to for this event (§4.3). */
  defaultChannels: readonly NotificationChannel[]
  /** In-app cannot be turned off for this event's category (§5.2 "Locked channels"). */
  inAppLocked?: true
  /** Email cannot be turned off for this exact event (§5.2 — currently only billing.payment_failed). */
  emailLocked?: true
  /** Who receives it, in the words of F-ID-07 §5.1 — not yet a resolver function. */
  recipients: string
  /**
   * The `action_url` template. `{token}`/`{id}`/... are filled by the emitting
   * code; `{url}` marks `platform.broadcast`, whose action_url is the given URL,
   * not a fixed template (§5.1 "the given URL").
   */
  actionUrl: string
  /** i18n lookup: `notifications.events.<dot.path>.title` / `...body` in both locales. */
  messageKey: string
}

function entry(
  event: string,
  category: NotificationCategory,
  priority: NotificationPriority,
  recipients: string,
  actionUrl: string,
  extra: Partial<
    Pick<
      NotificationCatalogEntry,
      "priorityVaries" | "defaultChannels" | "inAppLocked" | "emailLocked"
    >
  > = {}
): NotificationCatalogEntry {
  return {
    event,
    category,
    priority,
    recipients,
    actionUrl,
    messageKey: `notifications.events.${event}`,
    defaultChannels: extra.defaultChannels ?? NOTIFICATION_CHANNELS,
    ...(extra.priorityVaries ? { priorityVaries: extra.priorityVaries } : {}),
    ...(extra.inAppLocked ? { inAppLocked: extra.inAppLocked } : {}),
    ...(extra.emailLocked ? { emailLocked: extra.emailLocked } : {}),
  }
}

// Security category's in-app channel is locked on for every event in it (§5.2).
const SECURITY_LOCKED = { inAppLocked: true as const }

/** The full v1 catalogue, in the order F-ID-07 §5.1 lists it. */
export const NOTIFICATION_CATALOG: readonly NotificationCatalogEntry[] = [
  entry(
    "auth.new_device_signin",
    "security",
    "high",
    "the user",
    "/settings/security",
    SECURITY_LOCKED
  ),
  entry(
    "account.deletion_scheduled",
    "security",
    "high",
    "the user",
    "/settings/security",
    SECURITY_LOCKED
  ),
  entry(
    "account.deletion_cancelled",
    "security",
    "normal",
    "the user",
    "/settings/security",
    SECURITY_LOCKED
  ),

  entry("invite.received", "people", "high", "invitee", "/invite/{token}"),
  entry(
    "invite.accepted",
    "people",
    "normal",
    "inviter + admins",
    "/app/staff/team"
  ),
  entry(
    "invite.declined",
    "people",
    "low",
    "inviter",
    "/app/staff/team?tab=invitations"
  ),
  entry(
    "invite.expired",
    "people",
    "low",
    "inviter",
    "/app/staff/team?tab=invitations"
  ),

  entry(
    "join_request.received",
    "people",
    "high",
    "owners + admins",
    "/app/staff/team?tab=pending"
  ),
  entry("join_request.approved", "people", "high", "joiner", "/app"),
  entry(
    "join_request.rejected",
    "people",
    "normal",
    "joiner",
    "/personal/workspaces"
  ),

  entry("member.role_changed", "people", "high", "the member", "/app"),
  entry(
    "member.removed",
    "people",
    "high",
    "the member",
    "/personal/workspaces"
  ),
  entry("member.left", "people", "low", "owners + admins", "/app/staff/team"),
  entry(
    "workspace.ownership_transferred",
    "people",
    "high",
    "new owner, previous owner, admins",
    "/app/settings/workspace"
  ),

  entry(
    "guardian.invited",
    "people",
    "normal",
    "guardian (if a user)",
    "/invite/{token}"
  ),
  entry(
    "guardian.linked",
    "people",
    "normal",
    "class teacher",
    "/app/students/{id}"
  ),

  entry(
    "document_request.received",
    "people",
    "high",
    "candidate",
    "/personal/requests"
  ),
  entry(
    "document_request.approved",
    "people",
    "normal",
    "requester",
    "/app/hiring/applications/{id}"
  ),
  entry(
    "document_request.declined",
    "people",
    "normal",
    "requester",
    "/app/hiring/applications/{id}"
  ),
  entry(
    "document_request.revoked",
    "people",
    "normal",
    "requester",
    "/app/hiring/applications/{id}"
  ),
  entry(
    "document_request.expiring",
    "people",
    "normal",
    "candidate + requester",
    "/personal/requests"
  ),

  entry(
    "attendance.low",
    "academics",
    "high",
    "class teacher + admins",
    "/app/attendance/alerts?section={id}"
  ),
  entry(
    "exam.reminder",
    "academics",
    "normal",
    "teachers of the exam",
    "/app/exams/{id}"
  ),
  entry(
    "assignment.due_soon",
    "academics",
    "low",
    "assigned teachers",
    "/app/assignments/{id}"
  ),
  entry(
    "marks.published",
    "academics",
    "normal",
    "parents of the section",
    "/family/{student}/marks"
  ),
  entry(
    "report_card.ready",
    "academics",
    "normal",
    "parents",
    "/family/{student}/reports"
  ),
  entry(
    "behaviour.logged",
    "academics",
    "normal",
    "parents (when parent-visible)",
    "/family/{student}/behaviour"
  ),
  entry(
    "cover.assigned",
    "academics",
    "high",
    "cover teacher",
    "/app/cover/{id}"
  ),

  entry("print.ready", "system", "normal", "requester", "/app/print/{id}"),
  entry("print.failed", "system", "high", "requester", "/app/print/{id}"),

  entry("ai_credits.low", "billing", "high", "owner + the teacher", "/app/ai"),
  entry(
    "ai_credits.exhausted",
    "billing",
    "high",
    "owner + the teacher",
    "/app/ai"
  ),
  entry(
    "ai_credits.requested",
    "billing",
    "normal",
    "owner",
    "/app/ai/requests"
  ),
  entry("billing.trial_ending", "billing", "high", "owner", "/app/billing"),
  entry("billing.payment_failed", "billing", "high", "owner", "/app/billing", {
    emailLocked: true,
  }),
  entry(
    "billing.invoice_ready",
    "billing",
    "normal",
    "owner",
    "/app/billing/invoices/{id}"
  ),

  entry(
    "marketplace.sale",
    "marketplace",
    "normal",
    "seller",
    "/sell/orders/{id}"
  ),
  entry(
    "marketplace.listing_approved",
    "marketplace",
    "high",
    "seller",
    "/sell/listings/{id}"
  ),
  entry(
    "marketplace.changes_requested",
    "marketplace",
    "high",
    "seller",
    "/sell/listings/{id}"
  ),
  entry(
    "marketplace.rejected",
    "marketplace",
    "high",
    "seller",
    "/sell/listings/{id}"
  ),
  entry(
    "marketplace.payout_paid",
    "marketplace",
    "normal",
    "seller",
    "/sell/payouts/{id}"
  ),
  entry(
    "marketplace.refund_issued",
    "marketplace",
    "high",
    "seller + buyer",
    "/sell/orders/{id}"
  ),
  entry("kyc.approved", "marketplace", "high", "seller", "/sell/kyc"),
  entry("kyc.rejected", "marketplace", "high", "seller", "/sell/kyc"),

  entry(
    "hiring.application_received",
    "people",
    "normal",
    "hiring staff",
    "/app/hiring/applications/{id}"
  ),
  entry(
    "hiring.interview_scheduled",
    "people",
    "high",
    "candidate + interviewers",
    "/app/hiring/interviews/{id}"
  ),
  entry(
    "hiring.offer_made",
    "people",
    "high",
    "candidate",
    "/personal/applications/{id}"
  ),

  entry(
    "message.mention",
    "messages",
    "normal",
    "mentioned user",
    "/app/messages/{channel}"
  ),
  entry(
    "message.dm",
    "messages",
    "normal",
    "recipient",
    "/app/messages/{channel}"
  ),
  entry(
    "announcement.published",
    "messages",
    "normal",
    "audience",
    "/app/messages/announcements/{id}"
  ),

  entry("platform.broadcast", "system", "normal", "as targeted", "{url}", {
    priorityVaries: true,
  }),

  entry(
    "support.grant_requested",
    "security",
    "high",
    "owner / platform staff",
    "/app/settings/workspace?tab=support",
    SECURITY_LOCKED
  ),
  entry(
    "support.granted",
    "security",
    "high",
    "owner / platform staff",
    "/app/settings/workspace?tab=support",
    SECURITY_LOCKED
  ),
  entry(
    "support.expired",
    "security",
    "high",
    "owner / platform staff",
    "/app/settings/workspace?tab=support",
    SECURITY_LOCKED
  ),
] as const

/** Flat list of every declared event id — what the parity script diffs code against. */
export const NOTIFICATION_EVENT_IDS: readonly string[] =
  NOTIFICATION_CATALOG.map((row) => row.event)

const CATALOG_BY_EVENT: ReadonlyMap<string, NotificationCatalogEntry> = new Map(
  NOTIFICATION_CATALOG.map((row) => [row.event, row])
)

export function isNotificationEvent(value: string): boolean {
  return CATALOG_BY_EVENT.has(value)
}

export function catalogEntry(
  event: string
): NotificationCatalogEntry | undefined {
  return CATALOG_BY_EVENT.get(event)
}

export class UnknownNotificationEventError extends Error {
  constructor(readonly event: string) {
    super(
      `"${event}" is not in the notification event catalogue (F-ID-07 §5.1).`
    )
    this.name = "UnknownNotificationEventError"
  }
}

/** Category is always derived from the catalogue — callers never supply one (§5.1). */
export function categoryForEvent(event: string): NotificationCategory {
  const row = catalogEntry(event)
  if (!row) throw new UnknownNotificationEventError(event)
  return row.category
}

export function priorityForEvent(event: string): NotificationPriority {
  const row = catalogEntry(event)
  if (!row) throw new UnknownNotificationEventError(event)
  return row.priority
}

export function actionUrlTemplateForEvent(event: string): string {
  const row = catalogEntry(event)
  if (!row) throw new UnknownNotificationEventError(event)
  return row.actionUrl
}
