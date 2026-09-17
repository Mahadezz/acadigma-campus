import "server-only"

import type { AcadigmaSupabaseClient } from "@acadigma/db"

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
 * One function serves both the pre-session case (registration, the instant
 * `signUp` returns — `actor_id` ends up null, `rowId` carries the new user's id
 * instead) and the authenticated case (`auth.uid()` attributes `actor_id`
 * correctly): `log_auth_event` is granted to `anon` as well as `authenticated`
 * precisely so a plain request-scoped client is enough for both, and no
 * `withServiceRole` bypass is needed just to write an audit line.
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

export async function logAuthEvent(
  supabase: AcadigmaSupabaseClient,
  input: LogAuthEventInput
): Promise<void> {
  const ctx = input.context ?? (await getRequestContext())
  const { error } = await supabase.rpc("log_auth_event", {
    p_action: input.action,
    p_row_id: input.rowId ?? null,
    p_after: input.after ?? null,
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
  })
  if (error) {
    // Never let an audit-logging failure take down the auth flow it is
    // describing — surface it to the structured logs instead. Matches the
    // console.warn(JSON) pattern packages/db/src/client.ts already uses for
    // this same "before pino is wired up everywhere" situation.
    console.warn(
      JSON.stringify({
        event: "audit_log_failed",
        action: input.action,
        error: error.message,
      })
    )
  }
}
