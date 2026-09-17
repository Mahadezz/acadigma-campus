import {
  createBrowserClient as createSsrBrowserClient,
  createServerClient as createSsrServerClient,
} from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"

import { publicSupabaseConfig, serviceRoleKey } from "./env"

import type { Database } from "./types.generated"
import type { SupabaseClient } from "@supabase/supabase-js"

export type AcadigmaSupabaseClient = SupabaseClient<Database>

/**
 * One cookie store, three call sites: Next middleware, Server Components and Route
 * Handlers each expose cookies differently, so the caller adapts once and hands us
 * this shape. Keeping it framework-agnostic is what lets `packages/db` stay free of
 * a `next` dependency.
 */
export type CookieStore = {
  getAll: () => { name: string; value: string }[]
  /**
   * Server Components cannot write cookies. Callers there pass a no-op; the session
   * is refreshed by `middleware.ts` instead, which is the documented @supabase/ssr
   * pattern.
   */
  setAll: (
    cookies: {
      name: string
      value: string
      options?: Record<string, unknown>
    }[]
  ) => void
}

/**
 * Browser client: publishable key + the user's JWT. Used for reads that RLS already
 * protects and for Realtime subscriptions — never for writes (ARCHITECTURE §3).
 */
export function createBrowserClient(): AcadigmaSupabaseClient {
  const { url, publishableKey } = publicSupabaseConfig()
  return createSsrBrowserClient<Database>(url, publishableKey)
}

/**
 * Server client bound to the request's cookies. Still runs as the signed-in user, so
 * RLS applies to everything it touches. This is the client almost all server code
 * should use.
 */
export function createServerClient(
  cookies: CookieStore
): AcadigmaSupabaseClient {
  const { url, publishableKey } = publicSupabaseConfig()
  return createSsrServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (cookiesToSet) => cookies.setAll(cookiesToSet),
    },
  })
}

/**
 * Service-role client. Bypasses RLS entirely — it is the one credential in the
 * system that can read every tenant's data. Not exported: reach it through
 * `withServiceRole`, which forces a written reason and logs the use.
 */
function createServiceClient(): AcadigmaSupabaseClient {
  const { url } = publicSupabaseConfig()
  return createClient<Database>(url, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-acadigma-service-role": "true" } },
  })
}

/** Where `withServiceRole` sends its audit line. Swapped for pino in the app. */
export type ServiceRoleLogger = (entry: {
  reason: string
  durationMs: number
  outcome: "ok" | "error"
}) => void

let logServiceRoleUse: ServiceRoleLogger = (entry) => {
  // Structured so it is greppable in Vercel logs even before pino is wired in.
  console.warn(JSON.stringify({ event: "service_role_used", ...entry }))
}

/** Lets the app route these lines through its pino logger with a correlation id. */
export function setServiceRoleLogger(logger: ServiceRoleLogger): void {
  logServiceRoleUse = logger
}

/**
 * The only way to obtain a service-role client.
 *
 * ARCHITECTURE §3 limits service-role use to webhooks, cron jobs and explicitly
 * reviewed admin operations. The `reason` argument is that review, written down: it
 * appears in the logs next to every bypass of RLS, so "why did this code read
 * another tenant's rows" is answerable after the fact.
 *
 * ```ts
 * await withServiceRole("sslcommerz-ipn: record inbound event", async (db) => {
 *   await db.from("inbound_events").insert(event)
 * })
 * ```
 */
export async function withServiceRole<T>(
  reason: string,
  operation: (client: AcadigmaSupabaseClient) => Promise<T>
): Promise<T> {
  if (!reason.trim()) {
    throw new Error(
      "withServiceRole requires a reason describing why RLS is bypassed."
    )
  }
  const startedAt = Date.now()
  try {
    const result = await operation(createServiceClient())
    logServiceRoleUse({
      reason,
      durationMs: Date.now() - startedAt,
      outcome: "ok",
    })
    return result
  } catch (error) {
    logServiceRoleUse({
      reason,
      durationMs: Date.now() - startedAt,
      outcome: "error",
    })
    throw error
  }
}
