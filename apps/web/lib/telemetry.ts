import { SpanStatusCode, trace, type Span } from "@opentelemetry/api"

/**
 * OpenTelemetry helpers (DECISION-LOG D-30; docs/engineering/OBSERVABILITY.md).
 *
 * The SDK itself is registered once, in `apps/web/instrumentation.ts`, via
 * `@vercel/otel`. Everything here is what feature code reaches for afterwards:
 * a tracer, and a way to put `workspace_id`/`correlation_id` on a span the same
 * way every log line already carries them (`apps/web/lib/logger.ts`), so a trace,
 * a log line and an `audit_events` row can be joined on the same identifiers.
 *
 * Never put personal data on a span — the same rule as the logger
 * (OBSERVABILITY.md §1.2): identifiers only, never a name, email, phone number
 * or anything else a parent would recognise as theirs.
 */

export const OTEL_SERVICE_NAME = "acadigma-campus"

export function getTracer() {
  return trace.getTracer(OTEL_SERVICE_NAME)
}

export type WorkspaceSpanAttributes = {
  workspaceId?: string
  correlationId?: string
  userId?: string
  role?: string
}

/**
 * Sets the identifiers every span in this product should carry, when known.
 * Mirrors the fields `requestLogger()` binds (`apps/web/lib/logger.ts`).
 */
export function setWorkspaceSpanAttributes(
  span: Span,
  attrs: WorkspaceSpanAttributes
): void {
  if (attrs.workspaceId) span.setAttribute("workspace_id", attrs.workspaceId)
  if (attrs.correlationId) {
    span.setAttribute("correlation_id", attrs.correlationId)
  }
  if (attrs.userId) span.setAttribute("user.id", attrs.userId)
  if (attrs.role) span.setAttribute("role", attrs.role)
}

/**
 * Runs `fn` inside a new active span carrying the workspace/correlation
 * attributes, and records the outcome — a shared shape for server actions and
 * repository calls that want a span without hand-rolling try/catch/finally.
 *
 * ```ts
 * const row = await withWorkspaceSpan(
 *   "attendance.save",
 *   { workspaceId: ctx.workspaceId, correlationId },
 *   () => repo.save(ctx, input)
 * )
 * ```
 */
export async function withWorkspaceSpan<T>(
  name: string,
  attrs: WorkspaceSpanAttributes,
  fn: (span: Span) => Promise<T> | T
): Promise<T> {
  const tracer = getTracer()
  return tracer.startActiveSpan(name, async (span) => {
    setWorkspaceSpanAttributes(span, attrs)
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error))
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      span.end()
    }
  })
}

export type AiSpanAttributes = WorkspaceSpanAttributes & {
  /** The Anthropic model id, e.g. "claude-sonnet-5". */
  model: string
  /** Short verb naming the AI action, e.g. "syllabus.extract" (matches `ai_actions`). */
  operation: string
}

/**
 * AI-call span attributes, following the OTel `gen_ai.*` semantic convention
 * (D-30: "AI spans with `gen_ai.*` + `user.id = workspace_id`"). `user.id` is
 * deliberately the workspace, not a person — AI spend is billed and rate-limited
 * per workspace, never per user.
 */
export function setAiSpanAttributes(span: Span, attrs: AiSpanAttributes): void {
  setWorkspaceSpanAttributes(span, attrs)
  span.setAttribute("gen_ai.system", "anthropic")
  span.setAttribute("gen_ai.request.model", attrs.model)
  span.setAttribute("gen_ai.operation.name", attrs.operation)
  if (attrs.workspaceId) span.setAttribute("user.id", attrs.workspaceId)
}
