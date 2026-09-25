// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-OP-03 §7 `GET /api/pdf/[runId]` — route auth tests (task brief: "no
 * cross-tenant data"). Proves the shape parse -> context -> `can()` -> fetch
 * (RLS-scoped) -> render never skips a step: an invalid id, a denied role and
 * an invisible/cross-tenant run each stop the request before a single byte of
 * PDF is rendered.
 */

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: (...args: unknown[]) => mockRequireWorkspace(...args),
}))

const mockCreateClient = vi.fn(async () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}))

const mockCan = vi.fn()
vi.mock("@acadigma/domain", () => ({
  can: (...args: unknown[]) => mockCan(...args),
}))

const mockGetReportRun = vi.fn()
vi.mock("@acadigma/db/repositories/reports", () => ({
  getReportRun: (...args: unknown[]) => mockGetReportRun(...args),
}))

const mockGetSchoolProfile = vi.fn()
vi.mock("@acadigma/db/repositories/settings", () => ({
  getSchoolProfile: (...args: unknown[]) => mockGetSchoolProfile(...args),
}))

const mockRenderPdfToBuffer = vi.fn()
vi.mock("@acadigma/pdf", () => ({
  renderPdfToBuffer: (...args: unknown[]) => mockRenderPdfToBuffer(...args),
  SampleDocument: (props: unknown) => props,
}))

const { GET } = await import("./route")

const RUN_ID = "11111111-1111-1111-1111-111111111111"
const CTX = {
  workspaceId: "ws-1",
  userId: "user-1",
  role: "teacher",
  workspaceType: "school",
  plan: "starter",
}

function requestFor(id: string): Request {
  return new Request(`https://campus.test/api/pdf/${id}`)
}

function callWith(id: string) {
  return GET(requestFor(id), { params: Promise.resolve({ runId: id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWorkspace.mockResolvedValue(CTX)
  mockCan.mockReturnValue(true)
  mockGetSchoolProfile.mockResolvedValue({
    ok: true,
    data: {
      fields: { legal_name: "Test School" },
      branding: {
        header_line_1: null,
        header_line_2: null,
        accent: null,
        report_footer: null,
      },
    },
  })
  mockRenderPdfToBuffer.mockResolvedValue(Buffer.from("%PDF-fake"))
})

describe("shape: parse -> context -> can() -> fetch -> render", () => {
  it("422s an id that is not a uuid, before ever resolving a workspace context", async () => {
    const response = await callWith("not-a-uuid")
    expect(response.status).toBe(422)
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
    expect(mockGetReportRun).not.toHaveBeenCalled()
  })

  it("403s when the role cannot view reports, before touching report_runs", async () => {
    mockCan.mockReturnValue(false)
    const response = await callWith(RUN_ID)
    expect(response.status).toBe(403)
    expect(mockGetReportRun).not.toHaveBeenCalled()
    expect(mockRenderPdfToBuffer).not.toHaveBeenCalled()
  })

  it("maps a not_found run (RLS-invisible or genuinely missing — same response either way, no cross-tenant data) to 404", async () => {
    mockGetReportRun.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "not found" },
    })
    const response = await callWith(RUN_ID)
    expect(response.status).toBe(404)
    expect(mockRenderPdfToBuffer).not.toHaveBeenCalled()
  })

  it("409s a run that is still queued, and never renders", async () => {
    mockGetReportRun.mockResolvedValue({
      ok: true,
      data: {
        id: RUN_ID,
        status: "queued",
        locale: "en",
        requestedAt: "2026-09-25T00:00:00.000Z",
        completedAt: null,
      },
    })
    const response = await callWith(RUN_ID)
    expect(response.status).toBe(409)
    expect(mockRenderPdfToBuffer).not.toHaveBeenCalled()
  })

  it("409s a failed run with a distinct message, and never renders", async () => {
    mockGetReportRun.mockResolvedValue({
      ok: true,
      data: {
        id: RUN_ID,
        status: "failed",
        locale: "en",
        requestedAt: "2026-09-25T00:00:00.000Z",
        completedAt: null,
      },
    })
    const response = await callWith(RUN_ID)
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error.message).toMatch(/failed/i)
  })

  it("streams application/pdf for a ready run, only after every gate passes", async () => {
    mockGetReportRun.mockResolvedValue({
      ok: true,
      data: {
        id: RUN_ID,
        status: "ready",
        locale: "bn",
        requestedAt: "2026-09-25T00:00:00.000Z",
        completedAt: "2026-09-25T00:05:00.000Z",
      },
    })
    const response = await callWith(RUN_ID)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toContain(RUN_ID)
    expect(mockRenderPdfToBuffer).toHaveBeenCalledTimes(1)

    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Buffer.from(bytes).toString()).toBe("%PDF-fake")
  })
})
