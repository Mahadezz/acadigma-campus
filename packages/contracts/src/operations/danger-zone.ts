import { z } from "zod"

/**
 * F-OP-07 Part 6 (D-211) — the danger zone: archive / unarchive, a 30-day
 * cancellable deletion, and "export all data". Every action is owner-only
 * and re-checked in the database (`public.archive_workspace` & co.).
 */

/** Archive, unarchive and schedule-deletion all ask for the school's name. */
export const confirmNameInputSchema = z.object({
  confirmName: z.string().trim().min(1).max(200),
})
export type ConfirmNameInput = z.infer<typeof confirmNameInputSchema>

/**
 * The database's named refusals, carried in `ApiError.fieldErrors._root` so
 * the UI can pick its own copy without parsing messages.
 */
export const DANGER_ERROR = {
  NAME_MISMATCH: "NAME_MISMATCH",
  ACTIVE_SUBSCRIPTION: "ACTIVE_SUBSCRIPTION",
  UNPAID_BALANCE: "UNPAID_BALANCE",
  ALREADY_ARCHIVED: "ALREADY_ARCHIVED",
  NOT_ARCHIVED: "NOT_ARCHIVED",
  ARCHIVE_EXPIRED: "ARCHIVE_EXPIRED",
  ALREADY_SCHEDULED: "ALREADY_SCHEDULED",
  NOT_SCHEDULED: "NOT_SCHEDULED",
  DELETION_DUE: "DELETION_DUE",
  RATE_LIMITED: "RATE_LIMITED",
} as const
export type DangerError = (typeof DANGER_ERROR)[keyof typeof DANGER_ERROR]

/** What the danger-zone page and the deletion banner read. */
export const dangerZoneStateSchema = z.object({
  name: z.string(),
  status: z.enum(["active", "suspended", "archived"]),
  archivedAt: z.string().nullable(),
  deletionScheduledAt: z.string().nullable(),
})
export type DangerZoneState = z.infer<typeof dangerZoneStateSchema>

/** `requireWritable`'s reason when the school is archived (not a plan limit). */
export const ARCHIVED_READ_ONLY_REASON = "This school is archived."
