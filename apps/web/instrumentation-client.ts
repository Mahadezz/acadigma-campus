/**
 * Browser error reporting. Guarded by the same env var as the server side, so a
 * deployment without a DSN ships no Sentry bundle at all: the SDK is imported
 * dynamically, because a static import put ~128 kB (gzip) of it in front of
 * every page's first paint, and Lighthouse's simulated LCP on `/` and `/login`
 * counts every script requested before the first paint.
 */
import type * as SentryNs from "@sentry/nextjs"

type Sentry = typeof SentryNs

const sentry: Promise<Sentry> | null = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? import("@sentry/nextjs").then((s) => {
      s.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      })
      return s
    })
  : null

export function onRouterTransitionStart(
  ...args: Parameters<Sentry["captureRouterTransitionStart"]>
) {
  void sentry?.then((s) => s.captureRouterTransitionStart(...args))
}
