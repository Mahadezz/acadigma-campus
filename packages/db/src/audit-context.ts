import type { AcadigmaSupabaseClient } from "./client"

/**
 * Correlation-id threading (F-ID-09 §5.2, OBSERVABILITY §1.4).
 *
 * The primary mechanism is `app.pre_request()`, a PostgREST `db-pre-request` hook
 * wired by `supabase/migrations/20260917020200_audit_substrate.sql` §9: it copies
 * the `x-correlation-id` request header into the `app.correlation_id`
 * transaction-local setting for every statement of ONE PostgREST request, before
 * RLS runs — which is what lets `app.tg_audit()` see it automatically for a
 * browser-driven server action, no application code required.
 *
 * That hook does not apply to a caller that is not going through PostgREST's
 * per-request header path — a background job or a webhook handler issuing one RPC
 * that performs several statements. `setCorrelationId` is the explicit fallback
 * for exactly that case: call it once at the top of such a function, before any
 * write whose audit row should carry the id.
 */
export async function setCorrelationId(
  client: AcadigmaSupabaseClient,
  correlationId: string
): Promise<void> {
  await client.rpc("set_correlation_id", { p_correlation_id: correlationId })
}
