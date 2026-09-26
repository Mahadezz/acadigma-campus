// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-10 results tab (D-306): a parent downloads only what the seam returns
 * through their own RLS client; a bad link, a non-parent and an id RLS hides
 * each stop before a byte of PDF is rendered.
 */

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: (...args: unknown[]) => mockRequireWorkspace(...args),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }))
vi.mock("@/lib/i18n", () => ({ getMessages: async () => ({ locale: "bn" }) }))

const mockGetSchoolProfile = vi.fn()
vi.mock("@acadigma/db/repositories/settings", () => ({
  getSchoolProfile: (...args: unknown[]) => mockGetSchoolProfile(...args),
}))

const mockRender = vi.fn()
vi.mock("@acadigma/pdf", () => ({
  renderPdfToBuffer: (...args: unknown[]) => mockRender(...args),
  ReportCardDocument: (props: unknown) => props,
}))

const mockGetReportCardData = vi.fn()
vi.mock("@/app/(school)/app/reports/report-card-data", () => ({
  getReportCardData: (...args: unknown[]) => mockGetReportCardData(...args),
}))

const { GET } = await import("./route")

const EXAM = "11111111-1111-4111-8111-111111111111"
const STUDENT = "22222222-2222-4222-8222-222222222222"
const CTX = { workspaceId: "ws-1", userId: "u-1", role: "parent" }

function call(query: string) {
  return GET(new Request(`https://campus.test/api/family/report-card?${query}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWorkspace.mockResolvedValue(CTX)
  mockGetSchoolProfile.mockResolvedValue({ ok: false, error: {} })
  mockRender.mockResolvedValue(Buffer.from("%PDF-fake"))
  mockGetReportCardData.mockResolvedValue({
    ok: true,
    data: { studentCode: "STU-2026-0001" },
  })
})

describe("GET /api/family/report-card", () => {
  it("422s a bad link before resolving a context", async () => {
    const response = await call(`examId=${EXAM}&studentId=nope`)
    expect(response.status).toBe(422)
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("403s anyone but a parent", async () => {
    mockRequireWorkspace.mockResolvedValueOnce({ ...CTX, role: "teacher" })
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(403)
    expect(mockGetReportCardData).not.toHaveBeenCalled()
  })

  it("404s a result RLS does not show this parent", async () => {
    mockGetReportCardData.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_found", message: "No result." },
    })
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("renders the parent's own child's card in their language", async () => {
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain(
      "report-card-STU-2026-0001.pdf"
    )
    expect(mockGetReportCardData.mock.calls[0]?.slice(1)).toEqual([
      CTX,
      STUDENT,
      EXAM,
    ])
    expect(mockRender.mock.calls[0]?.[0]).toMatchObject({ locale: "bn" })
  })
})
