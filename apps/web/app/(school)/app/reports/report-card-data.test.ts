import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AcadigmaSupabaseClient, WorkspaceContext } from "@acadigma/db"

/**
 * The seam (D-206 → D-305): it delegates to the results repository with the
 * caller's client and context, passes refusals through, and never hands the
 * template a DTO that breaks `reportCardDtoSchema`.
 */
const mockGetReportCard = vi.fn()
const mockGetSectionResults = vi.fn()
vi.mock("@acadigma/db/repositories/results", () => ({
  getReportCard: (...args: unknown[]) => mockGetReportCard(...args),
  getSectionResults: (...args: unknown[]) => mockGetSectionResults(...args),
}))

const { getReportCardBulkStudentIds, getReportCardData } =
  await import("./report-card-data")

const CLIENT = { tag: "rls-client" } as unknown as AcadigmaSupabaseClient
const CTX = { workspaceId: "w" } as unknown as WorkspaceContext
const STUDENT = "00000000-0000-4000-8000-000000000001"
const EXAM = "00000000-0000-4000-9000-000000000001"
const SECTION = "00000000-0000-4000-7000-000000000001"

const DTO = {
  studentNameEn: "Ayesha Rahman",
  studentNameBn: "আয়েশা রহমান",
  studentCode: "STU-2026-00001",
  rollNumber: 1,
  className: "Class 6",
  sectionName: "ক",
  examNameEn: "Half-Yearly 2026",
  examNameBn: "Half-Yearly 2026",
  subjects: [
    {
      subjectNameEn: "Mathematics",
      subjectNameBn: "গণিত",
      subjectKind: "compulsory",
      status: "entered",
      marksObtained: 85,
      fullMarks: 100,
      letter: "A+",
      gradePoint: 5,
    },
  ],
  totalObtained: 85,
  totalFull: 100,
  percentage: 85,
  gpa: 5,
  gpaWithoutOptional: null,
  overallLetter: "A+",
  result: "pass",
  rank: 1,
  rankTied: false,
  rankOf: 40,
  attendance: {
    presentDays: 20,
    totalDays: 22,
    percent: 91,
    belowMinimum: false,
  },
}

describe("getReportCardData (the seam)", () => {
  beforeEach(() => {
    mockGetReportCard.mockReset()
    mockGetSectionResults.mockReset()
  })

  it("reads through the caller's client and returns the checked DTO", async () => {
    mockGetReportCard.mockResolvedValue({ ok: true, data: DTO })
    expect(await getReportCardData(CLIENT, CTX, STUDENT, EXAM)).toEqual({
      ok: true,
      data: DTO,
    })
    expect(mockGetReportCard).toHaveBeenCalledWith(CTX, CLIENT, STUDENT, EXAM)
  })

  it("passes not_found through (no result, or not the teacher's class)", async () => {
    const notFound = {
      ok: false,
      error: {
        code: "not_found",
        message: "No result for this student and exam.",
      },
    }
    mockGetReportCard.mockResolvedValue(notFound)
    expect(await getReportCardData(CLIENT, CTX, STUDENT, EXAM)).toEqual(
      notFound
    )
  })

  it("refuses a DTO the template cannot print", async () => {
    mockGetReportCard.mockResolvedValue({
      ok: true,
      data: { ...DTO, result: "incomplete" },
    })
    const result = await getReportCardData(CLIENT, CTX, STUDENT, EXAM)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

/**
 * F-OP-03 Part 5 (D-207) — the bulk roster resolver's own contract test,
 * real since F-AC-06 Part 5 (D-305, #68): it never returns a `ReportCardDto`,
 * only the ids `getReportCardData` is then called with, one at a time —
 * including a roll-number-less student, whom `getSectionResults` does NOT
 * filter out (D-305's own rule: that refusal belongs to `getReportCard`).
 */
describe("getReportCardBulkStudentIds", () => {
  it("resolves every studentId from getSectionResults, in its own order", async () => {
    mockGetSectionResults.mockResolvedValue({
      ok: true,
      data: {
        examId: EXAM,
        examName: "Half-Yearly 2026",
        sectionId: SECTION,
        sectionLabel: "Class 6 – ক",
        computedAt: "2026-09-26T00:00:00.000Z",
        rows: [
          { studentId: "s-1", rollNumber: 1 },
          { studentId: "s-2", rollNumber: null }, // no roll number (D-305)
          { studentId: "s-3", rollNumber: 3 },
        ],
      },
    })
    const result = await getReportCardBulkStudentIds(CLIENT, CTX, SECTION, EXAM)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual(["s-1", "s-2", "s-3"])
    expect(mockGetSectionResults).toHaveBeenCalledWith(
      CTX,
      CLIENT,
      EXAM,
      SECTION
    )
  })

  it("passes a getSectionResults error through unchanged", async () => {
    const notFound = {
      ok: false,
      error: {
        code: "not_found",
        message: "That exam or section does not exist.",
      },
    }
    mockGetSectionResults.mockResolvedValue(notFound)
    const result = await getReportCardBulkStudentIds(CLIENT, CTX, SECTION, EXAM)
    expect(result).toEqual(notFound)
  })

  it("resolves an empty roster to an empty list, not an error", async () => {
    mockGetSectionResults.mockResolvedValue({
      ok: true,
      data: {
        examId: EXAM,
        examName: "Half-Yearly 2026",
        sectionId: SECTION,
        sectionLabel: "Class 6 – ক",
        computedAt: null,
        rows: [],
      },
    })
    const result = await getReportCardBulkStudentIds(CLIENT, CTX, SECTION, EXAM)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual([])
  })
})
