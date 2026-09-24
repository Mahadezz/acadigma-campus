import "server-only"

import {
  withServiceRole,
  type AcadigmaSupabaseClient,
  type Json,
} from "@acadigma/db"

import { getRequestContext } from "./request-context"

import type { RequestContext } from "./request-context"

/**
 * Calls `public.log_auth_event` (migration 20260917020000), a narrow, allowlisted
 * wrapper around `app.log_audit_event` (migration 20260917010200) for the
 * account-level events F-ID-01 names: `account.registered`, `account.login`,
 * `account.logout`, `account.email_verified`, `account.password_reset`,
 * `account.password_changed`, `session.revoked_all`. `workspace_id` is always
 * null — this feature's rows are user-scoped, not tenant-scoped (F-ID-01 §3).
 *
 * Security review N1: `log_auth_event` no longer accepts `row_id`/`ip`/
 * `user_agent` as arguments — a caller holding only the publishable key must
 * not be able to write an audit row naming an arbitrary user, IP or
 * user-agent. `row_id` is always `auth.uid()` on the Postgres side, which is
 * correct for every action here except one: `account.registered` is logged
 * the instant `signUp` returns, before a session exists, so `auth.uid()` is
 * null and the new user's id has to come from the caller. That one case goes
 * through `withServiceRole` to the service_role-only
 * `public.log_auth_event_service`, which still takes `row_id`/`ip`/
 * `user_agent` — safe there only because `SUPABASE_SERVICE_ROLE_KEY` never
 * reaches a browser (ARCHITECTURE §3).
 */
type LogAuthEventInput = {
  action:
    | "account.registered"
    | "account.email_verified"
    | "account.login"
    | "account.logout"
    | "account.password_reset"
    | "account.password_changed"
    | "session.revoked_all"
  rowId?: string | null
  after?: Record<string, unknown> | null
  context?: RequestContext
}

// Audit metadata is always built from plain JSON-safe values by the callers in
// this file, so narrowing to the generated `Json` type is sound. `undefined`
// (not `null`) lets PostgREST fall back to the SQL default for the argument.
function toJson(
  value: Record<string, unknown> | null | undefined
): Json | undefined {
  return value ? (value as Json) : undefined
}

function warnAuditLogFailed(action: string, message: string): void {
  // Never let an audit-logging failure take down the auth flow it is
  // describing — surface it to the structured logs instead. Matches the
  // console.warn(JSON) pattern packages/db/src/client.ts already uses for
  // this same "before pino is wired up everywhere" situation.
  console.warn(
    JSON.stringify({ event: "audit_log_failed", action, error: message })
  )
}

export async function logAuthEvent(
  supabase: AcadigmaSupabaseClient,
  input: LogAuthEventInput
): Promise<void> {
  if (input.action === "account.registered") {
    const rowId = input.rowId
    if (!rowId) {
      warnAuditLogFailed(input.action, "missing rowId for account.registered")
      return
    }
    const ctx = input.context ?? (await getRequestContext())
    await withServiceRole(
      "auth.log_auth_event: account.registered runs pre-session, so row_id " +
        "cannot come from auth.uid() -- see log_auth_event_service",
      async (db) => {
        const { error } = await db.rpc("log_auth_event_service", {
          p_action: input.action,
          p_row_id: rowId,
          p_after: toJson(input.after),
          p_ip: ctx.ip ?? undefined,
          p_user_agent: ctx.userAgent ?? undefined,
        })
        if (error) warnAuditLogFailed(input.action, error.message)
      }
    )
    return
  }

  const { error } = await supabase.rpc("log_auth_event", {
    p_action: input.action,
    p_after: toJson(input.after),
  })
  if (error) warnAuditLogFailed(input.action, error.message)
}
