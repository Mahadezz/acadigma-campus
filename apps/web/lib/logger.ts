import "server-only"

import { randomUUID } from "node:crypto"

import { headers } from "next/headers"

import pino from "pino"

/**
 * Structured JSON logging (ARCHITECTURE §10).
 *
 * Every line carries a `correlationId` so a user's bug report, a Vercel log line, a
 * Sentry event and an `audit_events` row can be lined up. Identifiers only — never a
 * name, email, phone number or anything else a parent would recognise as theirs.
 */
export const CORRELATION_HEADER = "x-correlation-id"

export const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { app: "acadigma-campus" },
  // Vercel and most log sinks expect epoch milliseconds under `time`.
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.access_token",
      "*.refresh_token",
      "*.service_role_key",
    ],
    censor: "[redacted]",
  },
})

/**
 * Reads the correlation id from the incoming request, or mints one. Clients may send
 * their own; it is only ever used as a log label, so an attacker-supplied value can
 * do nothing worse than make their own traces confusing.
 */
export async function correlationId(): Promise<string> {
  const requestHeaders = await headers()
  return requestHeaders.get(CORRELATION_HEADER) ?? randomUUID()
}

/**
 * A logger bound to this request. Prefer it over the bare `logger` anywhere a
 * request exists.
 *
 * ```ts
 * const log = await requestLogger({ route: "attendance.save" })
 * log.info({ workspaceId, count }, "attendance saved")
 * ```
 */
export async function requestLogger(
  bindings: Record<string, unknown> = {}
): Promise<pino.Logger> {
  return logger.child({ correlationId: await correlationId(), ...bindings })
}
