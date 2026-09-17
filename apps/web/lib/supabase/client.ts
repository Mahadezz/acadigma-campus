"use client"

import { createBrowserClient, type AcadigmaSupabaseClient } from "@acadigma/db"

let client: AcadigmaSupabaseClient | undefined

/**
 * Browser Supabase client, created once per tab.
 *
 * Used for reads that RLS already protects and for Realtime subscriptions. Writes go
 * through Server Actions so the policy check in `packages/domain` runs before the
 * database sees them (ARCHITECTURE §3).
 *
 * The singleton matters: a second client opens a second Realtime socket and a second
 * auth listener, and the two race each other on token refresh.
 */
export function getSupabaseBrowserClient(): AcadigmaSupabaseClient {
  client ??= createBrowserClient()
  return client
}
