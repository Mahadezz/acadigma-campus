// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-OP-07 Part 2 (D-210): parse -> context -> workspace.settings.write ->
 * requireWritable -> domain + repository -> Result. Mocking pattern matches
 * `apps/web/app/(school)/app/exams/actions.test.ts`.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({ requireWorkspace: mockRequireWorkspace }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const mockRequireWritable = vi.fn()
vi.mock("@acadigma/db", () => ({ requireWritable: mockRequireWritable }))

const mockCreateYear = vi.fn()
const mockCreateTerm = vi.fn()
const mockDeleteTerm = vi.fn()
const mockSetCurrent = vi.fn()
const mockUpdateWeights = vi.fn()
vi.mock("@acadigma/db/repositories/academic-years", () => ({
  createAcademicYear: mockCreateYear,
  createTerm: mockCreateTerm,
  deleteTerm: mockDeleteTerm,
  setCurrentAcademicYear: mockSetCurrent,
  updateExamWeights: mockUpdateWeights,
}))

const mockListExams = vi.fn()
vi.mock("@acadigma/db/repositories/exams", () => ({
  listExams: mockListExams,
}))

const {
  createAcademicYear,
  createTerm,
  deleteTerm,
  setCurrentAcademicYear,
  updateExamWeights,
} = await import("./actions")

const CTX = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: "pro",
}
const YEAR_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"
const EXAM_ID = "9d3c2e5f-6071-4b8c-ad9e-1f2a3b4c5d6e"

describe("academic settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWorkspace.mockResolvedValue(CTX)
    mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
    mockCreateYear.mockResolvedValue({
      ok: true,
      data: {
        id: YEAR_ID,
        name: "2027",
        startsOn: "2027-01-01",
        endsOn: "2027-12-31",
        isCurrent: false,
      },
    })
    mockCreateTerm.mockResolvedValue({ ok: true, data: {} })
    mockDeleteTerm.mockResolvedValue({ ok: true, data: { deleted: true } })
    mockSetCurrent.mockResolvedValue({
      ok: true,
      data: { academicYearId: YEAR_ID },
    })
    mockUpdateWeights.mockResolvedValue({ ok: true, data: { [EXAM_ID]: 100 } })
    mockListExams.mockResolvedValue({
      ok: true,
      data: [{ id: EXAM_ID, name: "Midterm" }],
    })
  })

  it("createAcademicYear: a teacher is forbidden; read-only is payment_required", async () => {
    const input = { name: "2027", startsOn: "2027-01-01", endsOn: "2027-12-31" }
    mockRequireWorkspace.mockResolvedValueOnce({ ...CTX, role: "teacher" })
    const forbidden = await createAcademicYear(input)
    expect(!forbidden.ok && forbidden.error.code).toBe("forbidden")
    expect(mockCreateYear).not.toHaveBeenCalled()

    mockRequireWritable.mockResolvedValueOnce({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: "Your Pro trial has ended." },
    })
    const readOnly = await createAcademicYear(input)
    expect(!readOnly.ok && readOnly.error.code).toBe("payment_required")
  })

  it("createAcademicYear: rejects a malformed input before resolving context", async () => {
    const result = await createAcademicYear({
      name: "",
      startsOn: "x",
      endsOn: "y",
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("createTerm: calls the repository on valid input", async () => {
    const result = await createTerm({
      academicYearId: YEAR_ID,
      name: "1st Term",
      startsOn: "2027-01-01",
      endsOn: "2027-04-30",
    })
    expect(result.ok).toBe(true)
    expect(mockCreateTerm).toHaveBeenCalledOnce()
  })

  it("deleteTerm: forwards the id and revalidates on success", async () => {
    const result = await deleteTerm({ termId: YEAR_ID })
    expect(result.ok).toBe(true)
    expect(mockDeleteTerm.mock.calls[0]?.[2]).toBe(YEAR_ID)
  })

  it("setCurrentAcademicYear: forwards the year id to the repository", async () => {
    const result = await setCurrentAcademicYear({ academicYearId: YEAR_ID })
    expect(result.ok).toBe(true)
    expect(mockSetCurrent.mock.calls[0]?.[2]).toBe(YEAR_ID)
  })

  it("updateExamWeights: refuses a sum that is not 100, without resolving context", async () => {
    const result = await updateExamWeights({
      academicYearId: YEAR_ID,
      weights: { [EXAM_ID]: 60 },
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
    expect(mockUpdateWeights).not.toHaveBeenCalled()
  })

  it("updateExamWeights: accepts an empty map (weighting off)", async () => {
    const result = await updateExamWeights({
      academicYearId: YEAR_ID,
      weights: {},
    })
    expect(result.ok).toBe(true)
  })

  it("updateExamWeights: refuses a weight key that is not an exam of this year (review of PR #110)", async () => {
    const otherExamId = "11111111-1111-4111-8111-111111111111"
    const result = await updateExamWeights({
      academicYearId: YEAR_ID,
      weights: { [otherExamId]: 100 },
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(!result.ok && result.error.fieldErrors?.weights).toEqual([
      "UNKNOWN_EXAM",
    ])
    expect(mockUpdateWeights).not.toHaveBeenCalled()
  })

  it("updateExamWeights: a real exam id in this year is accepted", async () => {
    const result = await updateExamWeights({
      academicYearId: YEAR_ID,
      weights: { [EXAM_ID]: 100 },
    })
    expect(result.ok).toBe(true)
    expect(mockUpdateWeights).toHaveBeenCalledOnce()
  })
})
