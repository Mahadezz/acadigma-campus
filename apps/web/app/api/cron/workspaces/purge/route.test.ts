// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/** F-OP-07 Part 6 (D-211): the purge route fails closed without the secret. */

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

const mockWithServiceRole = vi.fn()
const mockPurge = vi.fn()

vi.mock("@acadigma/db", () => ({
  withServiceRole: (...args: unknown[]) => mockWithServiceRole(...args),
  purgeDueWorkspaces: (...args: unknown[]) => mockPurge(...args),
}))

const { GET } = await import("./route")

const request = (authorization?: string) =>
  new Request("https://campus.test/api/cron/workspaces/purge", {
    headers: authorization ? { authorization } : undefined,
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = "test-cron-secret"
  mockWithServiceRole.mockImplementation(
    async (_reason: string, operation: (client: unknown) => unknown) =>
      operation({})
  )
})

describe("GET /api/cron/workspaces/purge", () => {
  it("401s without the secret and never reaches the service role", async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request("Bearer wrong"))).status).toBe(401)
    expect(mockWithServiceRole).not.toHaveBeenCalled()
  })

  it("401s when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET
    expect((await GET(request("Bearer "))).status).toBe(401)
  })

  it("returns purged and failed ids", async () => {
    mockPurge.mockResolvedValue({
      ok: true,
      data: { purged: ["w1"], failed: [{ id: "w2", code: "FILES_PRESENT" }] },
    })
    const response = await GET(request("Bearer test-cron-secret"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      purged: ["w1"],
      failed: [{ id: "w2", code: "FILES_PRESENT" }],
    })
    expect(mockWithServiceRole.mock.calls[0]?.[0]).toMatch(/workspace-purge/)
  })
})
