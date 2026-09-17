import { handlePreflight } from "../_shared/cors.ts"
import { serviceClient } from "../_shared/service-client.ts"

/**
 * SSLCommerz IPN receiver — **skeleton**.
 *
 * What this function does today, and what it must keep doing:
 *
 *   1. Accept the POST, whatever it contains.
 *   2. Record it in `inbound_events`, keyed by `tran_id`, before interpreting it.
 *   3. Return 200.
 *
 * The order matters. SSLCommerz retries anything that is not a 200, so a failure
 * *after* the row is stored is recoverable — the event is on disk and a job can
 * replay it. A failure before it is stored loses the payment notification.
 *
 * Deliberately NOT implemented here (owned by the payments feature):
 *   - calling the gateway's validation API with the store credentials, which is the
 *     only thing that makes a payment real (the POST body is attacker-controlled);
 *   - moving the order state machine or granting entitlements.
 *
 * ARCHITECTURE §5: "Entitlements are granted only from a processed, validated event."
 * Nothing below grants anything.
 */

type InboundEvent = {
  provider: "sslcommerz"
  /** Gateway transaction id. Unique index on (provider, external_id) dedupes retries. */
  external_id: string
  event_type: string
  payload: Record<string, string>
  status: "received"
}

/** SSLCommerz posts `application/x-www-form-urlencoded`, not JSON. */
async function readForm(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, string>
  }
  const form = await request.formData()
  return Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)])
  )
}

Deno.serve(async (request: Request): Promise<Response> => {
  const preflight = handlePreflight(request)
  if (preflight) return preflight

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  let payload: Record<string, string>
  try {
    payload = await readForm(request)
  } catch {
    // Unparseable body: nothing to store and nothing to retry.
    return new Response("Bad request", { status: 400 })
  }

  const tranId = payload["tran_id"]
  if (!tranId) {
    return new Response("Missing tran_id", { status: 400 })
  }

  const event: InboundEvent = {
    provider: "sslcommerz",
    external_id: tranId,
    event_type: payload["status"] ?? "unknown",
    payload,
    status: "received",
  }

  const supabase = serviceClient("sslcommerz-ipn: record inbound payment event")

  // Idempotent by (provider, external_id): a retry of an event we already hold is a
  // no-op, not a duplicate row and not an error.
  const { error } = await supabase.from("inbound_events").upsert(event, {
    onConflict: "provider,external_id",
    ignoreDuplicates: true,
  })

  if (error) {
    // Log and 500 so the gateway retries; the event is not yet safely stored.
    console.error(
      JSON.stringify({
        event: "inbound_event_write_failed",
        tranId,
        error: error.message,
      })
    )
    return new Response("Storage failed", { status: 500 })
  }

  console.log(JSON.stringify({ event: "inbound_event_recorded", tranId }))
  return new Response("OK", { status: 200 })
})
