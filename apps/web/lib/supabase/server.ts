import "server-only"

import { cookies } from "next/headers"

import { createServerClient, type AcadigmaSupabaseClient } from "@acadigma/db"

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * It runs as the signed-in user, so RLS applies to everything it reads and writes.
 * Service-role access goes through `withServiceRole(reason)` instead
 * (ARCHITECTURE §3).
 *
 * Never cache the returned client across requests: it is bound to one request's
 * cookies, and sharing it would hand one user another user's session.
 */
export async function createClient(): Promise<AcadigmaSupabaseClient> {
  const cookieStore = await cookies()

  return createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      } catch {
        // Server Components cannot set cookies. That is fine: middleware.ts
        // refreshes the session on every request, so the write here is redundant.
      }
    },
  })
}
