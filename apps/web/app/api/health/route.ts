import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

/** Never cached: a cached health check reports the past. */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Anything slower than this is as good as down for an uptime monitor. */
const TIMEOUT_MS = 3_000

type CheckResult = { ok: boolean; latencyMs: number; error?: string }

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    ),
  ])
}

/**
 * Checks that Supabase is reachable and answering.
 *
 * `auth.getUser()` on an anonymous request is the cheapest round trip that proves
 * the whole path works — DNS, TLS, the gateway and GoTrue — without needing a table
 * to exist or a policy to allow anything. It returns "no session", which is a
 * successful answer, not a failure.
 */
async function checkSupabase(): Promise<CheckResult> {
  const startedAt = Date.now()
  try {
    const supabase = await createClient()
    await withTimeout(supabase.auth.getUser(), TIMEOUT_MS)
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "unknown error",
    }
  }
}

export async function GET() {
  const supabase = await checkSupabase()
  const healthy = supabase.ok

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checkedAt: new Date().toISOString(),
      // Set by Vercel; absent locally.
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      checks: { supabase },
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  )
}
