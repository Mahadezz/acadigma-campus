// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/** F-AC-06 Part 2: parse -> context -> exams.write -> requireWritable -> domain -> repo. */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({ requireWorkspace: mockRequireWorkspace }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const mockRequireWritable = vi.fn()
vi.mock("@acadigma/db", () => ({ requireWritable: mockRequireWritable }))

const mockCreate = vi.fn()
const mockGet = vi.fn()
const mockSetStatus = vi.fn()
const mockUpdatePaper = vi.fn()
vi.mock("@acadigma/db/repositories/exams", () => ({
  createExam: mockCreate,
  getExam: mockGet,
  setExamStatus: mockSetStatus,
  updateExamSubject: mockUpdatePaper,
}))

const { createExam, setExamStatus, updateExamSubject } =
  await import("./actions")

const CTX = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: "pro",
}
const ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"
const CREATE = {
  academicYearId: ID,
  name: "Half-Yearly 2026",
  examType: "term_final",
  startsOn: "2026-06-01",
  endsOn: "2026-06-14",
  sectionIds: [ID],
  subjectIds: [ID],
}

describe("exam actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWorkspace.mockResolvedValue(CTX)
    mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
    mockCreate.mockResolvedValue({ ok: true, data: { examId: ID } })
    mockSetStatus.mockResolvedValue({ ok: true, data: undefined })
    mockUpdatePaper.mockResolvedValue({ ok: true, data: undefined })
  })

  it("createExam: defaults full marks to 100 and calls the repository", async () => {
    expect(await createExam(CREATE)).toEqual({ ok: true, data: { examId: ID } })
    expect(mockCreate.mock.calls[0]?.[2]).toMatchObject({ fullMarks: 100 })
  })

  it("createExam: refuses an end before the start before resolving context", async () => {
    const result = await createExam({ ...CREATE, endsOn: "2026-05-01" })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("createExam: a teacher is forbidden; read-only is payment_required", async () => {
    mockRequireWorkspace.mockResolvedValueOnce({ ...CTX, role: "teacher" })
    const forbidden = await createExam(CREATE)
    expect(!forbidden.ok && forbidden.error.code).toBe("forbidden")

    mockRequireWritable.mockResolvedValueOnce({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: "Your Pro trial has ended." },
    })
    const readOnly = await createExam(CREATE)
    expect(!readOnly.ok && readOnly.error.code).toBe("payment_required")
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("setExamStatus: a skipped step is refused by the domain, not sent", async () => {
    mockGet.mockResolvedValue({ ok: true, data: { status: "draft" } })
    const result = await setExamStatus({ examId: ID, status: "marks_entry" })
    expect(!result.ok && result.error.code).toBe("conflict")
    expect(mockSetStatus).not.toHaveBeenCalled()
  })

  it("setExamStatus: a reversal needs a reason", async () => {
    mockGet.mockResolvedValue({ ok: true, data: { status: "marks_locked" } })
    const missing = await setExamStatus({ examId: ID, status: "marks_entry" })
    expect(!missing.ok && missing.error.fieldErrors?.["reason"]).toEqual([
      "REASON_REQUIRED",
    ])
    const given = await setExamStatus({
      examId: ID,
      status: "marks_entry",
      reason: "Wrong marks",
    })
    expect(given.ok).toBe(true)
    expect(mockSetStatus).toHaveBeenCalledOnce()
  })

  it("updateExamSubject: pass above full is refused", async () => {
    const result = await updateExamSubject({
      id: ID,
      examDate: null,
      fullMarks: 50,
      passMarks: 60,
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(mockUpdatePaper).not.toHaveBeenCalled()
  })
})
