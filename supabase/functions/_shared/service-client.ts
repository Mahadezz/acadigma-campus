import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

/**
 * Service-role client for Edge Functions.
 *
 * Webhooks arrive with no session, so this is one of the three places
 * ARCHITECTURE §3 allows service-role access. The `reason` is logged next to every
 * use, mirroring `withServiceRole` in `packages/db` — a bypass of RLS should be
 * greppable in the logs wherever it happens.
 */
export function serviceClient(reason: string): SupabaseClient {
  if (!reason.trim()) {
    throw new Error(
      "serviceClient requires a reason describing why RLS is bypassed."
    )
  }
  console.log(JSON.stringify({ event: "service_role_used", reason }))

  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
