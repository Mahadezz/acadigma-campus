"use server"

import {
  apiError,
  apiErrorFromZod,
  correlationInputSchema,
  err,
  getAuditEventInputSchema,
  listAuditEventsInputSchema,
  recordHistoryInputSchema,
  type ApiError,
  type AuditEventDto,
  type AuditEventPage,
  type Result,
} from "@acadigma/contracts"
import {
  getAuditEvent as getAuditEventRepo,
  getRecordHistory as getRecordHistoryRepo,
  listAuditEvents as listAuditEventsRepo,
  listCorrelatedEvents as listCorrelatedEventsRepo,
} from "@acadigma/db/repositories"
import { can } from "@acadigma/domain/permissions"

import { getLocale, type Locale } from "@/lib/i18n"
import { requestLogger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

/**
 * Server actions for the owner audit viewer (F-ID-09 Parts 1-3), following the
 * shape CLAUDE.md rule 5 fixes for every server action: parse -> resolve context ->
 * policy check -> repository -> return `Result<T, ApiError>`.
 *
 * `requireWorkspace()` resolves `WorkspaceContext` the same way every other screen
 * does; it redirects/forbids on its own for "not signed in" / "not a member" rather
 * than returning a Result for those two cases (matching `apps/web/lib/workspace.ts`
 * and `dashboard/page.tsx`'s documented pattern). What THIS file adds on top is the
 * `audit.read` permission check (§2): a member can resolve a workspace context and
 * still not be allowed to read its trail (an admin, by default — §11 OQ-2).
 */

const FORBIDDEN: ApiError = apiError(
  "forbidden",
  "You do not have access to the audit trail."
)

export async function listAuditEvents(
  input: unknown
): Promise<Result<AuditEventPage, ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "audit.read")) return err(FORBIDDEN)

  const parsed = listAuditEventsInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const client = await createClient()
  const result = await listAuditEventsRepo(ctx, client, parsed.data)
  if (!result.ok) {
    const log = await requestLogger({ route: "audit.list" })
    log.warn({ code: result.error.code }, "audit list failed")
  }
  return result
}

export async function getAuditEvent(
  input: unknown
): Promise<Result<AuditEventDto, ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "audit.read")) return err(FORBIDDEN)

  const parsed = getAuditEventInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const client = await createClient()
  return getAuditEventRepo(ctx, client, parsed.data)
}

export async function listCorrelatedEvents(
  input: unknown
): Promise<Result<AuditEventDto[], ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "audit.read")) return err(FORBIDDEN)

  const parsed = correlationInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const client = await createClient()
  return listCorrelatedEventsRepo(ctx, client, parsed.data)
}

export async function getRecordHistory(
  input: unknown
): Promise<Result<AuditEventPage, ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "audit.read")) return err(FORBIDDEN)

  const parsed = recordHistoryInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const client = await createClient()
  return getRecordHistoryRepo(ctx, client, parsed.data)
}

/** The signed-in user's reading language, for the sentence renderer (F-ID-09
 * §5.2, acceptance criterion 18). D-401: delegates to `getLocale()` (the one
 * app-wide resolver: `acadigma_locale` cookie, then `profiles.locale`, then
 * `en`) instead of reading `profiles.locale` directly — this used to ignore
 * the cookie entirely, so switching language from the `UserMenu` left this
 * page on whatever `profiles.locale` last was. `requireWorkspace()` keeps
 * this page's existing membership gate; it plays no part in the language
 * choice. */
export async function getReaderLanguage(): Promise<Locale> {
  await requireWorkspace()
  return getLocale()
}
