// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-10 results tab (D-306, D-109): the card comes only from the family
 * path (`family_results`: the caller's actively linked children, published,
 * not withheld), whatever the caller's role; a bad link, a result not on
 * that list and a withheld one each stop before a byte of PDF is rendered.
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

const mockListFamilyResults = vi.fn()
vi.mock("@acadigma/db/repositories/results", () => ({
  listFamilyResults: (...args: unknown[]) => mockListFamilyResults(...args),
}))

const { GET } = await import("./route")

const EXAM = "11111111-1111-4111-8111-111111111111"
const STUDENT = "22222222-2222-4222-8222-222222222222"
const CTX = { workspaceId: "ws-1", userId: "u-1", role: "parent" }

function familyRow(card: object, withheld = false) {
  return { examId: EXAM, studentId: STUDENT, withheld, card }
}

function call(query: string) {
  return GET(new Request(`https://campus.test/api/family/report-card?${query}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWorkspace.mockResolvedValue(CTX)
  mockGetSchoolProfile.mockResolvedValue({ ok: false, error: {} })
  mockRender.mockResolvedValue(Buffer.from("%PDF-fake"))
  mockListFamilyResults.mockResolvedValue({
    ok: true,
    data: [familyRow({ studentCode: "STU-2026-0001" })],
  })
})

describe("GET /api/family/report-card", () => {
  it("422s a bad link before resolving a context", async () => {
    const response = await call(`examId=${EXAM}&studentId=nope`)
    expect(response.status).toBe(422)
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("404s a result that is not on the caller's family list", async () => {
    mockListFamilyResults.mockResolvedValueOnce({ ok: true, data: [] })
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("404s a withheld result", async () => {
    mockListFamilyResults.mockResolvedValueOnce({
      ok: true,
      data: [familyRow({ studentCode: "S" }, true)],
    })
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("serves a staff member who is also a parent from the family path", async () => {
    mockRequireWorkspace.mockResolvedValueOnce({ ...CTX, role: "teacher" })
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(200)
    expect(mockListFamilyResults).toHaveBeenCalledTimes(1)
  })

  it("renders the parent's own child's card in their language", async () => {
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain(
      "report-card-STU-2026-0001.pdf"
    )
    expect(mockListFamilyResults.mock.calls[0]?.[0]).toEqual(CTX)
    expect(mockRender.mock.calls[0]?.[0]).toMatchObject({ locale: "bn" })
  })

  it("keeps only safe characters of the student code in the filename", async () => {
    mockListFamilyResults.mockResolvedValueOnce({
      ok: true,
      data: [familyRow({ studentCode: 'S-1"; x=y\r\n' })],
    })
    const response = await call(`examId=${EXAM}&studentId=${STUDENT}`)
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="report-card-S-1xy.pdf"'
    )
  })
})
