import {
  apiError,
  err,
  ok,
  runBillingTickOutput,
  type ApiError,
  type Result,
  type RunBillingTickOutput,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"

/**
 * The daily billing tick (F-CM-06 Part 4, §7 `runSubscriptionJobs`, D-62). Unlike
 * every other repository function in this package, this one takes no
 * `WorkspaceContext` — it acts across every workspace at once, which is exactly
 * why it is reached only from `/api/cron/billing/tick` through `withServiceRole`,
 * never from a tenant-scoped request (HANDBOOK §1 rule 6).
 *
 * The state transition itself (subscriptions.status, workspaces.access_mode,
 * subscription_events, the audit row) happens inside `public.expire_pro_trials()`
 * — one Postgres function, one transaction (rule 9: audit rows come from the
 * database, not from this code; that function calls `app.set_access_mode()`,
 * whose own `app.log_audit_event()` call is what the audit trail records).
 * `app.*` is server-internal (D-50) and unreachable from a Supabase client at
 * all — `supabase/config.toml` only exposes `public` to PostgREST — so the SQL
 * side of this Part is a `public` wrapper function rather than a direct call
 * into `app`, and this file's only job is invoking it and mapping the result.
 */
export async function runTrialExpiryJob(
  client: AcadigmaSupabaseClient
): Promise<Result<RunBillingTickOutput, ApiError>> {
  const { data, error } = await client.rpc("expire_pro_trials")

  if (error) {
    return err(
      apiError("dependency_unavailable", "Could not run the trial-expiry job.")
    )
  }

  const parsed = runBillingTickOutput.safeParse({ trialsExpired: data })
  if (!parsed.success) {
    return err(
      apiError("internal", "The trial-expiry job returned an unexpected shape.")
    )
  }
  return ok(parsed.data)
}
