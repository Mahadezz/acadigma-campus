// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-CM-06 Part 4 (D-62): `CRON_SECRET` is the whole authorization model for
 * `/api/cron/*` (HANDBOOK §5.4 / SECURITY.md's STRIDE row S — "both 401 without
 * it"). This suite proves the route fails closed on every way that check can go
 * wrong, before it ever reaches `withServiceRole`, and that a real job result maps
 * to the right HTTP status either way.
 */

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

const mockWithServiceRole = vi.fn()
const mockRunTrialExpiryJob = vi.fn()

vi.mock("@acadigma/db", () => ({
  withServiceRole: (...args: unknown[]) => mockWithServiceRole(...args),
  runTrialExpiryJob: (...args: unknown[]) => mockRunTrialExpiryJob(...args),
}))

const { GET } = await import("./route")

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

function requestWith(headers?: Record<string, string>): Request {
  return new Request("https://campus.test/api/cron/billing/tick", {
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "test-cron-secret"
  mockWithServiceRole.mockImplementation(
    async (_reason: string, operation: (client: unknown) => unknown) =>
      operation({})
  )
})

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
  }
})

describe("authorization", () => {
  it("401s a request with no Authorization header at all", async () => {
    const response = await GET(requestWith())
    expect(response.status).toBe(401)
    expect(mockWithServiceRole).not.toHaveBeenCalled()
  })

  it("401s a request with the wrong secret", async () => {
    const response = await GET(
      requestWith({ authorization: "Bearer wrong-secret" })
    )
    expect(response.status).toBe(401)
    expect(mockWithServiceRole).not.toHaveBeenCalled()
  })

  it("401s a wrong secret of the same length as the real one (timing-safe path)", async () => {
    // Same length as "test-cron-secret" — exercises timingSafeEqual itself
    // rather than the length-mismatch early-out.
    const response = await GET(
      requestWith({ authorization: "Bearer test-cron-decoyy" })
    )
    expect(response.status).toBe(401)
    expect(mockWithServiceRole).not.toHaveBeenCalled()
  })

  it("401s every request when CRON_SECRET is not set — fails closed, never open", async () => {
    delete process.env.CRON_SECRET
    const response = await GET(
      requestWith({ authorization: "Bearer test-cron-secret" })
    )
    expect(response.status).toBe(401)
    expect(mockWithServiceRole).not.toHaveBeenCalled()
  })

  it("401s a bare secret with no Bearer prefix", async () => {
    const response = await GET(
      requestWith({ authorization: "test-cron-secret" })
    )
    expect(response.status).toBe(401)
  })
})

describe("the job", () => {
  it("runs through withServiceRole with a written reason, on GET (what Vercel Cron actually calls)", async () => {
    mockRunTrialExpiryJob.mockResolvedValue({
      ok: true,
      data: { trialsExpired: 2 },
    })

    const response = await GET(
      requestWith({ authorization: "Bearer test-cron-secret" })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ trialsExpired: 2 })
    expect(mockWithServiceRole).toHaveBeenCalledWith(
      expect.stringMatching(/\S+/),
      expect.any(Function)
    )
    expect(mockRunTrialExpiryJob).toHaveBeenCalledTimes(1)
  })

  it("maps a failed job to the error's own HTTP status, not a hardcoded one", async () => {
    mockRunTrialExpiryJob.mockResolvedValue({
      ok: false,
      error: {
        code: "dependency_unavailable",
        message: "Could not run the trial-expiry job.",
      },
    })

    const response = await GET(
      requestWith({ authorization: "Bearer test-cron-secret" })
    )

    expect(response.status).toBe(503)
  })
})
