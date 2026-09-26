// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-OP-03 Part 5 (D-207) — `renderReportCardBulkPdf`'s own contract test,
 * against the real seam signature (`getReportCardData`/
 * `getReportCardBulkStudentIds`, both real since F-AC-06 Part 5, #68,
 * D-305): mocks them and the render/merge calls, so this test proves the
 * failure-isolation and ordering contract independent of where the data
 * comes from.
 *
 * D-305 item 9: a student with no roll number still gets a card (the roll
 * prints "—") — `rollNumber` on `ReportCardDto` is nullable. The seam only
 * refuses a student with no paper counted at all. This test covers both: a
 * genuine seam refusal still isolates to one `failed` item (never a silent
 * drop, never a thrown exception), and a roll-less-but-successful card
 * sorts correctly rather than corrupting the comparator.
 */

const mockGetReportCardBulkStudentIds = vi.fn()
const mockGetReportCardData = vi.fn()
vi.mock("./report-card-data", () => ({
  getReportCardBulkStudentIds: (...args: unknown[]) =>
    mockGetReportCardBulkStudentIds(...args),
  getReportCardData: (...args: unknown[]) => mockGetReportCardData(...args),
}))

const mockRenderPdfToBuffer = vi.fn()
const mockMergeReportCardBulkPdf = vi.fn()
vi.mock("@acadigma/pdf", () => ({
  renderPdfToBuffer: (...args: unknown[]) => mockRenderPdfToBuffer(...args),
  ReportCardDocument: (props: unknown) => props,
  mergeReportCardBulkPdf: (...args: unknown[]) =>
    mockMergeReportCardBulkPdf(...args),
}))

const { renderReportCardBulkPdf } = await import("./report-card-bulk")

const CTX = {
  workspaceId: "ws-1",
  userId: "user-1",
  role: "teacher" as const,
  workspaceType: "school" as const,
  plan: "starter" as const,
}
const CLIENT = {} as never
const PARAMS = {
  kind: "report_card_bulk" as const,
  sectionId: "sec-1",
  examId: "exam-1",
  order: "roll" as const,
  duplex: false,
}
const BRANDING = {
  schoolName: "Test School",
  headerLines: [],
  accentColor: null,
  footerNote: null,
}

function dto(rollNumber: number | null, nameEn: string) {
  return {
    studentNameEn: nameEn,
    studentNameBn: nameEn,
    studentCode: `STU-${rollNumber ?? "none"}`,
    rollNumber,
    className: "Class 6",
    sectionName: "ক",
    examNameEn: "Half-Yearly",
    examNameBn: "অর্ধ-বার্ষিক",
    subjects: [
      {
        subjectNameEn: "Math",
        subjectNameBn: "গণিত",
        subjectKind: "compulsory" as const,
        status: "entered" as const,
        marksObtained: 80,
        fullMarks: 100,
        letter: "A",
        gradePoint: 5,
      },
    ],
    totalObtained: 80,
    totalFull: 100,
    percentage: 80,
    gpa: 5,
    gpaWithoutOptional: null,
    overallLetter: "A",
    result: "pass" as const,
    rank: 1,
    rankTied: false,
    rankOf: 3,
    attendance: {
      presentDays: 20,
      totalDays: 22,
      percent: 91,
      belowMinimum: false,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRenderPdfToBuffer.mockResolvedValue(Buffer.from("%PDF"))
  mockMergeReportCardBulkPdf.mockResolvedValue({
    buffer: Buffer.from("%PDF-merged"),
    pageCount: 2,
    pageRanges: [
      { from: 1, to: 1 },
      { from: 2, to: 2 },
    ],
  })
})

describe("renderReportCardBulkPdf", () => {
  it("returns the roster resolver's error unchanged when the section/exam is unknown", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "no section" },
    })
    const result = await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      PARAMS,
      "bn",
      BRANDING,
      new Date()
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error.message).toBe("no section")
      expect(result.error.items).toEqual([])
    }
    expect(mockGetReportCardData).not.toHaveBeenCalled()
  })

  it("records a student the seam refuses (no paper counted at all, D-305) as a failed item, never dropped, and still renders the rest", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: true,
      data: ["s1", "s2"],
    })
    mockGetReportCardData.mockImplementation(async (_c, _ctx, studentId) =>
      studentId === "s1"
        ? { ok: true, data: dto(1, "Student One") }
        : {
            ok: false,
            error: {
              code: "not_found",
              message: "No result for this student and exam.",
            },
          }
    )

    const result = await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      PARAMS,
      "bn",
      BRANDING,
      new Date()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(2)
    const failedItem = result.data.items.find((i) => i.studentId === "s2")
    expect(failedItem).toMatchObject({
      status: "failed",
      errorDetail: "No result for this student and exam.",
    })
    const readyItem = result.data.items.find((i) => i.studentId === "s1")
    expect(readyItem).toMatchObject({ status: "ready" })
    // Only the successful student's buffer reaches the merge step.
    expect(mockMergeReportCardBulkPdf).toHaveBeenCalledWith(
      [Buffer.from("%PDF")],
      false
    )
  })

  it("records a render throw as a failed item too, excluded from the merge", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: true,
      data: ["s1", "s2"],
    })
    mockGetReportCardData.mockImplementation(async (_c, _ctx, studentId) => ({
      ok: true,
      data: dto(studentId === "s1" ? 1 : 2, studentId),
    }))
    mockRenderPdfToBuffer.mockImplementation(async (props: unknown) =>
      (props as { rollNumber: number }).rollNumber === 2
        ? Promise.reject(new Error("boom"))
        : Buffer.from("%PDF")
    )

    const result = await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      PARAMS,
      "bn",
      BRANDING,
      new Date()
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const failedItem = result.data.items.find((i) => i.studentId === "s2")
    expect(failedItem).toMatchObject({ status: "failed", errorDetail: "boom" })
  })

  it("returns not_found with every attempted item when the whole roster fails, never calls merge (lead review: a teacher who cannot read the section still gets items explaining why)", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: true,
      data: ["s1", "s2"],
    })
    mockGetReportCardData.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "no data" },
    })
    const result = await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      PARAMS,
      "bn",
      BRANDING,
      new Date()
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.error.code).toBe("not_found")
      expect(result.error.items).toEqual([
        { studentId: "s1", status: "failed", errorDetail: "no data" },
        { studentId: "s2", status: "failed", errorDetail: "no data" },
      ])
    }
    expect(mockMergeReportCardBulkPdf).not.toHaveBeenCalled()
  })

  it("sorts a roll-less student (D-305: a card with no roll number) after every rolled student, tie-broken by name", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: true,
      data: ["s-none", "s-2", "s-1"],
    })
    mockGetReportCardData.mockImplementation(async (_c, _ctx, studentId) => {
      if (studentId === "s-none")
        return { ok: true, data: dto(null, "No Roll") }
      const roll = studentId === "s-2" ? 2 : 1
      return { ok: true, data: dto(roll, `Roll ${roll}`) }
    })
    mockRenderPdfToBuffer.mockImplementation(async (props: unknown) =>
      Buffer.from(
        `%PDF-${(props as { rollNumber: number | null }).rollNumber ?? "none"}`
      )
    )
    mockMergeReportCardBulkPdf.mockResolvedValue({
      buffer: Buffer.from("%PDF-merged"),
      pageCount: 3,
      pageRanges: [
        { from: 1, to: 1 },
        { from: 2, to: 2 },
        { from: 3, to: 3 },
      ],
    })

    await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      PARAMS,
      "bn",
      BRANDING,
      new Date()
    )

    expect(mockMergeReportCardBulkPdf).toHaveBeenCalledWith(
      [Buffer.from("%PDF-1"), Buffer.from("%PDF-2"), Buffer.from("%PDF-none")],
      false
    )
  })

  it("sorts by roll number ascending before merging", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: true,
      data: ["s-roll-3", "s-roll-1", "s-roll-2"],
    })
    mockGetReportCardData.mockImplementation(async (_c, _ctx, studentId) => {
      const roll = { "s-roll-3": 3, "s-roll-1": 1, "s-roll-2": 2 }[
        studentId as string
      ]!
      return { ok: true, data: dto(roll, `Roll ${roll}`) }
    })
    mockRenderPdfToBuffer.mockImplementation(async (props: unknown) =>
      Buffer.from(`%PDF-${(props as { rollNumber: number }).rollNumber}`)
    )
    mockMergeReportCardBulkPdf.mockResolvedValue({
      buffer: Buffer.from("%PDF-merged"),
      pageCount: 3,
      pageRanges: [
        { from: 1, to: 1 },
        { from: 2, to: 2 },
        { from: 3, to: 3 },
      ],
    })

    await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      PARAMS,
      "bn",
      BRANDING,
      new Date()
    )

    expect(mockMergeReportCardBulkPdf).toHaveBeenCalledWith(
      [Buffer.from("%PDF-1"), Buffer.from("%PDF-2"), Buffer.from("%PDF-3")],
      false
    )
  })

  it("sorts by name when order is 'name'", async () => {
    mockGetReportCardBulkStudentIds.mockResolvedValue({
      ok: true,
      data: ["s-b", "s-a"],
    })
    mockGetReportCardData.mockImplementation(async (_c, _ctx, studentId) => {
      const name = studentId === "s-b" ? "Beta" : "Alpha"
      const roll = studentId === "s-b" ? 2 : 1
      return { ok: true, data: dto(roll, name) }
    })
    mockRenderPdfToBuffer.mockImplementation(async (props: unknown) =>
      Buffer.from(`%PDF-${(props as { studentNameEn: string }).studentNameEn}`)
    )

    await renderReportCardBulkPdf(
      CLIENT,
      CTX,
      { ...PARAMS, order: "name" },
      "en",
      BRANDING,
      new Date()
    )

    expect(mockMergeReportCardBulkPdf).toHaveBeenCalledWith(
      [Buffer.from("%PDF-Alpha"), Buffer.from("%PDF-Beta")],
      false
    )
  })
})
