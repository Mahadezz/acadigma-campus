import { z } from "zod"

/**
 * The only error shape that ever crosses the server boundary (ARCHITECTURE §5).
 * Handlers never throw raw errors at a client: they return an ApiError so the UI
 * can branch on a stable `code` instead of matching on message strings.
 */
export const apiErrorCodeSchema = z.enum([
  "unauthenticated", // no valid session
  "forbidden", // authenticated, but the role or workspace does not allow it
  "not_found", // the row does not exist, or is invisible to this tenant
  "conflict", // optimistic-concurrency or unique-constraint clash
  "validation_failed", // input did not satisfy its Zod schema
  "rate_limited", // too many requests for this user or workspace
  "payment_required", // plan limit or credit balance exhausted
  "dependency_unavailable", // Supabase, SSLCommerz, Claude, Resend unreachable
  "internal", // anything we failed to classify — always logged with the correlation id
])

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

/** Per-field messages, keyed by the dotted form path the UI knows about. */
export const fieldErrorsSchema = z.record(z.string(), z.array(z.string()))

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  /** Safe to show a user. Never contains ids, SQL or provider payloads. */
  message: z.string().min(1),
  /** Ties a client report to the server log line (ARCHITECTURE §10). */
  correlationId: z.string().optional(),
  fieldErrors: fieldErrorsSchema.optional(),
  /** `rate_limited` only: seconds until the block lifts, so a form can
   * count down without parsing the message (D-101). */
  retryAfterSeconds: z.number().int().nonnegative().optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

/** HTTP status for each code, so route handlers never hand-pick a number. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  payment_required: 402,
  dependency_unavailable: 503,
  internal: 500,
}

export function httpStatusForError(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code]
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  extra?: Omit<ApiError, "code" | "message">
): ApiError {
  return { code, message, ...extra }
}

/** Turns a Zod failure into the envelope, preserving per-field detail. */
export function apiErrorFromZod(error: z.ZodError): ApiError {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root"
    ;(fieldErrors[path] ??= []).push(issue.message)
  }
  return {
    code: "validation_failed",
    message: "Some of the details you entered are not valid.",
    fieldErrors,
  }
}
