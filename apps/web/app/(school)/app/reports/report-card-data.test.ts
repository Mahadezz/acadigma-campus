import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AcadigmaSupabaseClient, WorkspaceContext } from "@acadigma/db"

/**
 * The seam (D-206 → D-305): it delegates to the results repository with the
 * caller's client and context, passes refusals through, and never hands the
 * template a DTO that breaks `reportCardDtoSchema`.
 */
const mockGetReportCard = vi.fn()
vi.mock("@acadigma/db/repositories/results", () => ({
  getReportCard: (...args: unknown[]) => mockGetReportCard(...args),
}))

const { getReportCardData } = await import("./report-card-data")

const CLIENT = { tag: "rls-client" } as unknown as AcadigmaSupabaseClient
const CTX = { workspaceId: "w" } as unknown as WorkspaceContext
const STUDENT = "00000000-0000-4000-8000-000000000001"
const EXAM = "00000000-0000-4000-9000-000000000001"

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
  beforeEach(() => mockGetReportCard.mockReset())

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
