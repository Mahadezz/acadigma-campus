/**
 * Webhook endpoints are called server-to-server, so they need no CORS at all.
 * These headers exist for the one case that does: a browser preflight against a
 * function we deliberately expose. Nothing here grants credentials.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/** Answers a preflight, or returns null when the request is the real thing. */
export function handlePreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null
  return new Response(null, { status: 204, headers: corsHeaders })
}
