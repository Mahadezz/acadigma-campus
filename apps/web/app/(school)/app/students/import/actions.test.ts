// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-AC-02 §4.7 (D-106): parse → context → can("students.import") →
 * requireWritable → repository. A teacher or a read-only school never
 * reaches the database; a bad file never creates a batch.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

const ctx = { workspaceId: "w", userId: "u", role: "admin" }
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: async () => ctx,
}))

const SECTION = "6a1d3b2f-9c8e-4d4b-8f70-2b3c4d5e6f7a"
const mockRequireWritable = vi.fn()
const mockCreate = vi.fn()
const mockRun = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...a: unknown[]) => mockRequireWritable(...a),
  createImportBatch: (...a: unknown[]) => mockCreate(...a),
  runImportBatch: (...a: unknown[]) => mockRun(...a),
  getClassesOverview: async () => ({
    ok: true,
    data: {
      year: { id: "y" },
      grades: [
        {
          name: "Class 6",
          nameBn: "ষষ্ঠ শ্রেণি",
          levelNumber: 6,
          sections: [{ id: SECTION, name: "ক" }],
        },
      ],
    },
  }),
}))

const { commitStudentImport, previewStudentImport } = await import("./actions")

const CSV =
  "first_name,last_name,date_of_birth,gender,class,section,guardian_relation,guardian_name,guardian_phone\r\n" +
  "Rahim,Uddin,09/03/2014,male,Class 6,ক,father,Karim Uddin,01000000001\r\n" +
  "Nusrat,Jahan,2014-02-31,female,Class 6,ক,mother,Salma Begum,01000000002\r\n"

function form(content: string, name = "register.csv"): FormData {
  const data = new FormData()
  data.set("file", new File([content], name))
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx.role = "admin"
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockCreate.mockResolvedValue({ ok: true, data: { batchId: "b" } })
  mockRun.mockResolvedValue({ ok: true, data: { createdCount: 1 } })
})

describe("previewStudentImport", () => {
  it("stores one valid row and one error row", async () => {
    const result = await previewStudentImport(form(CSV))
    expect(result).toEqual({ ok: true, data: { batchId: "b" } })
    const input = mockCreate.mock.calls[0]?.[2]
    expect(input.filename).toBe("register.csv")
    expect(input.totals).toEqual({ total: 2, valid: 1, error: 1 })
    expect(input.report.rows[0].input.guardian.phone).toBe("+8801000000001")
    expect(input.report.rows[1].errors).toEqual([
      { column: "date_of_birth", code: "invalid_date" },
    ])
  })

  it("names a file problem without creating a batch", async () => {
    const result = await previewStudentImport(form("a,b\r\n1,2\r\n"))
    expect(!result.ok && result.error.fieldErrors?.file).toEqual([
      "missing_columns",
    ])
    const wrong = await previewStudentImport(form("x", "register.pdf"))
    expect(!wrong.ok && wrong.error.fieldErrors?.file).toEqual(["wrong_type"])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("refuses a teacher and a read-only school before reading the file", async () => {
    ctx.role = "teacher"
    const teacher = await previewStudentImport(form(CSV))
    expect(!teacher.ok && teacher.error.code).toBe("forbidden")
    ctx.role = "owner"
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { reason: "Trial ended." },
    })
    const readOnly = await previewStudentImport(form(CSV))
    expect(!readOnly.ok && readOnly.error.code).toBe("payment_required")
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe("commitStudentImport", () => {
  it("runs the batch for an owner", async () => {
    const batchId = "7b2e4c3a-0d9f-4e5c-9a81-3c4d5e6f7a8b"
    const result = await commitStudentImport({ batchId })
    expect(result).toEqual({ ok: true, data: { createdCount: 1 } })
    expect(mockRun.mock.calls[0]?.[2]).toBe(batchId)
  })

  it("refuses a malformed id, a teacher and a read-only school", async () => {
    expect((await commitStudentImport({ batchId: "x" })).ok).toBe(false)
    ctx.role = "staff"
    const staff = await commitStudentImport({
      batchId: "7b2e4c3a-0d9f-4e5c-9a81-3c4d5e6f7a8b",
    })
    expect(!staff.ok && staff.error.code).toBe("forbidden")
    ctx.role = "admin"
    mockRequireWritable.mockResolvedValue({ ok: false, error: {} })
    const readOnly = await commitStudentImport({
      batchId: "7b2e4c3a-0d9f-4e5c-9a81-3c4d5e6f7a8b",
    })
    expect(!readOnly.ok && readOnly.error.code).toBe("payment_required")
    expect(mockRun).not.toHaveBeenCalled()
  })
})
