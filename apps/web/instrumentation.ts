import { OTEL_SERVICE_NAME } from "./lib/telemetry"

import type { captureRequestError } from "@sentry/nextjs"

/**
 * Observability bootstrap: OpenTelemetry first, Sentry second (DECISION-LOG D-30,
 * ARCHITECTURE §10, docs/engineering/OBSERVABILITY.md).
 *
 * `registerOTel` runs unconditionally and is safe with no configuration: `@vercel/
 * otel` auto-detects a Vercel tracing integration when deployed there, falls back
 * to an OTLP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` (+ optional
 * `OTEL_EXPORTER_OTLP_HEADERS`) is set, and is a no-op otherwise — local
 * development and CI never try to reach a collector that does not exist.
 *
 * Sentry stays entirely opt-in behind `SENTRY_DSN`: the *error-reporting* backend
 * is a deploy-time choice (Sentry vs Traceway, D-30) that has not been made yet;
 * OTel is the vendor-neutral contract underneath whichever one is picked.
 */
export async function register() {
  const { registerOTel } = await import("@vercel/otel")

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? OTEL_SERVICE_NAME,
    attributes: {
      "deployment.environment": process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    },
  })

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
