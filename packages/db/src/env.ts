/**
 * Environment access for the database layer. Reading `process.env` inline is how a
 * service-role key ends up in a browser bundle; every read goes through here so the
 * public/secret split is visible in one file (ARCHITECTURE §8).
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`
    )
  }
  return value
}

/** Safe in the browser. Inlined by Next at build time, so read the literal name. */
export function publicSupabaseConfig(): {
  url: string
  publishableKey: string
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    )
  }
  return { url, publishableKey }
}

/**
 * Server only. Throws loudly if it is ever reached from a bundle that has a
 * `window`, which is the last line of defence before a key leaks.
 */
export function serviceRoleKey(): string {
  // `"window" in globalThis` rather than `typeof window`: this module is typed
  // against the Node lib set, and the check has to hold in any runtime the key
  // could leak into.
  if ("window" in globalThis) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must never be read in the browser."
    )
  }
  return required("SUPABASE_SERVICE_ROLE_KEY")
}
