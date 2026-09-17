import type { captureRequestError } from "@sentry/nextjs"

/**
 * Server and edge error reporting (ARCHITECTURE §10).
 *
 * Entirely opt-in: with no SENTRY_DSN set — local development, CI, a fork — nothing
 * is loaded and nothing is sent. That keeps the default install free of a network
 * dependency while production still reports.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return

  const Sentry = await import("@sentry/nextjs")

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    // Sample rather than send everything; schools generate steady, uninteresting load.
    tracesSampleRate: 0.1,
    // ARCHITECTURE §10: identifiers only, never names, emails or phone numbers.
    sendDefaultPii: false,
  })
}

/** Lets Next attribute a failed request to the right span. */
export async function onRequestError(
  ...args: Parameters<typeof captureRequestError>
) {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureRequestError(...args)
}
