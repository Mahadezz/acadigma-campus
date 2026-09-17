import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  apiError,
  apiErrorCodeSchema,
  apiErrorFromZod,
  apiErrorSchema,
  httpStatusForError,
  type ApiErrorCode,
} from "./errors"

describe("apiError", () => {
  it("builds the envelope", () => {
    expect(apiError("not_found", "No such student.")).toEqual({
      code: "not_found",
      message: "No such student.",
    })
  })

  it("carries a correlation id and field errors when given", () => {
    const error = apiError("validation_failed", "Check the form.", {
      correlationId: "abc-123",
      fieldErrors: { email: ["Required."] },
    })
    expect(apiErrorSchema.parse(error)).toEqual(error)
  })
})

describe("httpStatusForError", () => {
  it("maps every code to a status", () => {
    for (const code of apiErrorCodeSchema.options) {
      expect(httpStatusForError(code)).toBeGreaterThanOrEqual(400)
    }
  })

  it("uses the statuses the API contract documents", () => {
    const expected: Record<ApiErrorCode, number> = {
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
    for (const [code, status] of Object.entries(expected)) {
      expect(httpStatusForError(code as ApiErrorCode)).toBe(status)
    }
  })
})

describe("apiErrorFromZod", () => {
  const schema = z.object({
    email: z.string().email(),
    guardian: z.object({ phone: z.string().min(11) }),
  })

  it("keys field errors by the dotted path the form knows", () => {
    const parsed = schema.safeParse({ email: "nope", guardian: { phone: "1" } })
    expect(parsed.success).toBe(false)
    if (parsed.success) return

    const error = apiErrorFromZod(parsed.error)
    expect(error.code).toBe("validation_failed")
    expect(Object.keys(error.fieldErrors ?? {})).toEqual([
      "email",
      "guardian.phone",
    ])
  })

  it("collects several messages for one field", () => {
    const strict = z.string().min(5).endsWith("!")
    const parsed = strict.safeParse("hi")
    if (parsed.success) throw new Error("expected a failure")

    const error = apiErrorFromZod(parsed.error)
    expect(error.fieldErrors?.["_root"]?.length).toBeGreaterThan(1)
  })

  it("never leaks the rejected value into the user-facing message", () => {
    const parsed = schema.safeParse({
      email: "secret@example.com",
      guardian: { phone: "1" },
    })
    if (parsed.success) throw new Error("expected a failure")
    expect(apiErrorFromZod(parsed.error).message).not.toContain("secret")
  })
})
