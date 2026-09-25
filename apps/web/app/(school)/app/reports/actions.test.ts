// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-OP-03 Parts 1-2 — `createReportRun` auth-gate tests. Proves the shape
 * (parse -> context -> `can()` -> plan entitlement -> `requireWritable` ->
 * repository) refuses at the first failing gate and never reaches the
 * repository or the render step past that point.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRequireWorkspace = vi.fn()
vi.mock("@/lib/workspace", () => ({
  requireWorkspace: (...args: unknown[]) => mockRequireWorkspace(...args),
}))

const mockCreateClient = vi.fn(async () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}))

const mockResolveEntitledNavModules = vi.fn()
vi.mock("@/lib/school-nav-entitlements", () => ({
  resolveEntitledNavModules: (...args: unknown[]) =>
    mockResolveEntitledNavModules(...args),
}))

const mockCan = vi.fn()
vi.mock("@acadigma/domain", () => ({
  can: (...args: unknown[]) => mockCan(...args),
}))
vi.mock("@acadigma/domain/settings", () => ({
  renderHeaderLine: (line: string) => line,
}))

const mockRequireWritable = vi.fn()
const mockWithServiceRole = vi.fn()
vi.mock("@acadigma/db", () => ({
  requireWritable: (...args: unknown[]) => mockRequireWritable(...args),
  withServiceRole: (...args: unknown[]) => mockWithServiceRole(...args),
}))

const mockCreateReportRunRepo = vi.fn()
const mockGetReportRun = vi.fn()
const mockMarkRendering = vi.fn()
const mockMarkReady = vi.fn()
const mockMarkFailed = vi.fn()
vi.mock("@acadigma/db/repositories/reports", () => ({
  createReportRun: (...args: unknown[]) => mockCreateReportRunRepo(...args),
  getReportRun: (...args: unknown[]) => mockGetReportRun(...args),
  markReportRunRendering: (...args: unknown[]) => mockMarkRendering(...args),
  markReportRunReady: (...args: unknown[]) => mockMarkReady(...args),
  markReportRunFailed: (...args: unknown[]) => mockMarkFailed(...args),
}))

const mockGetSchoolProfile = vi.fn()
vi.mock("@acadigma/db/repositories/settings", () => ({
  getSchoolProfile: (...args: unknown[]) => mockGetSchoolProfile(...args),
}))

const mockRenderPdfToBuffer = vi.fn()
vi.mock("@acadigma/pdf", () => ({
  renderPdfToBuffer: (...args: unknown[]) => mockRenderPdfToBuffer(...args),
  SampleDocument: (props: unknown) => props,
  ReportCardDocument: (props: unknown) => props,
}))

const mockGetReportCardData = vi.fn()
vi.mock("./report-card-data", () => ({
  getReportCardData: (...args: unknown[]) => mockGetReportCardData(...args),
}))

const { createReportRun } = await import("./actions")

const CTX = {
  workspaceId: "ws-1",
  userId: "user-1",
  role: "teacher",
  workspaceType: "school",
  plan: "starter",
}
const VALID_INPUT = { params: { kind: "sample" }, locale: "bn" }
const VALID_REPORT_CARD_INPUT = {
  params: {
    kind: "report_card",
    studentId: "11111111-1111-1111-1111-111111111111",
    examId: "22222222-2222-2222-2222-222222222222",
  },
  locale: "bn",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWorkspace.mockResolvedValue(CTX)
  mockCan.mockReturnValue(true)
  mockResolveEntitledNavModules.mockResolvedValue(["reports"])
  mockRequireWritable.mockResolvedValue({ ok: true, data: undefined })
  mockMarkRendering.mockResolvedValue({ ok: true, data: undefined })
  mockWithServiceRole.mockImplementation(
    async (_reason: string, op: (client: unknown) => unknown) => op({})
  )
})

describe("shape: parse -> context -> can() -> entitlement -> requireWritable -> repo", () => {
  it("rejects invalid input before resolving a workspace context at all", async () => {
    const result = await createReportRun({ params: { kind: "not-real" } })
    expect(result.ok).toBe(false)
    expect(mockRequireWorkspace).not.toHaveBeenCalled()
  })

  it("denies a role without report.render.sample, before touching the plan or the repo", async () => {
    mockCan.mockReturnValue(false)
    const result = await createReportRun(VALID_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("forbidden")
    expect(mockResolveEntitledNavModules).not.toHaveBeenCalled()
    expect(mockCreateReportRunRepo).not.toHaveBeenCalled()
  })

  it("blocks a Free-plan workspace with payment_required, before requireWritable or the repo", async () => {
    mockResolveEntitledNavModules.mockResolvedValue(["attendance"]) // no "reports"
    const result = await createReportRun(VALID_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("payment_required")
    expect(mockRequireWritable).not.toHaveBeenCalled()
    expect(mockCreateReportRunRepo).not.toHaveBeenCalled()
  })

  it("refuses a read-only workspace before the repo is touched", async () => {
    mockRequireWritable.mockResolvedValue({
      ok: false,
      error: { code: "read_only", message: "read only" },
    })
    const result = await createReportRun(VALID_INPUT)
    expect(result.ok).toBe(false)
    expect(mockCreateReportRunRepo).not.toHaveBeenCalled()
  })

  it("does not re-render an idempotent replay of an existing run", async () => {
    mockCreateReportRunRepo.mockResolvedValue({
      ok: true,
      data: { id: "run-1", status: "ready" },
    })
    const result = await createReportRun(VALID_INPUT)
    expect(result.ok).toBe(true)
    expect(mockWithServiceRole).not.toHaveBeenCalled()
  })

  it("kicks the render for a newly queued run", async () => {
    mockCreateReportRunRepo.mockResolvedValue({
      ok: true,
      data: { id: "run-1", status: "queued" },
    })
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
    mockGetReportRun.mockResolvedValue({
      ok: true,
      data: { id: "run-1", status: "ready", locale: "bn" },
    })
    mockRenderPdfToBuffer.mockResolvedValue(Buffer.from("%PDF"))

    const result = await createReportRun(VALID_INPUT)
    expect(result.ok).toBe(true)
    expect(mockWithServiceRole).toHaveBeenCalledTimes(1)
    expect(mockMarkRendering).toHaveBeenCalledWith(expect.anything(), "run-1")
    expect(mockMarkReady).toHaveBeenCalled()
  })
})

describe("report_card kind (D-206)", () => {
  it("checks report.render.report_card, not report.render.sample", async () => {
    // An idempotent replay (status already "ready") short-circuits before
    // the render step — this test only cares which action key can() saw.
    mockCreateReportRunRepo.mockResolvedValue({
      ok: true,
      data: { id: "run-idempotent", status: "ready" },
    })
    await createReportRun(VALID_REPORT_CARD_INPUT)
    expect(mockCan).toHaveBeenCalledWith("teacher", "report.render.report_card")
  })

  it("denies a role without report.render.report_card", async () => {
    mockCan.mockReturnValue(false)
    const result = await createReportRun(VALID_REPORT_CARD_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("forbidden")
    expect(mockCreateReportRunRepo).not.toHaveBeenCalled()
  })

  it("renders through getReportCardData and ReportCardDocument for a newly queued run", async () => {
    mockCreateReportRunRepo.mockResolvedValue({
      ok: true,
      data: { id: "run-2", status: "queued" },
    })
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
    mockGetReportRun.mockResolvedValue({
      ok: true,
      data: { id: "run-2", status: "ready", locale: "bn" },
    })
    mockGetReportCardData.mockResolvedValue({
      ok: true,
      data: { rollNumber: 1, studentNameEn: "Test Student" },
    })
    mockRenderPdfToBuffer.mockResolvedValue(Buffer.from("%PDF"))

    const result = await createReportRun(VALID_REPORT_CARD_INPUT)
    expect(result.ok).toBe(true)
    expect(mockGetReportCardData).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222"
    )
    expect(mockMarkReady).toHaveBeenCalled()
    expect(mockMarkFailed).not.toHaveBeenCalled()
  })

  it("marks the run failed with no_data when the seam has no data for this student/exam, never renders", async () => {
    mockCreateReportRunRepo.mockResolvedValue({
      ok: true,
      data: { id: "run-3", status: "queued" },
    })
    mockGetReportRun.mockResolvedValue({
      ok: true,
      data: { id: "run-3", status: "queued", locale: "bn" },
    })
    mockGetReportCardData.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "no fixture data" },
    })

    const result = await createReportRun(VALID_REPORT_CARD_INPUT)
    expect(result.ok).toBe(true) // createReportRun itself still succeeds; the RUN is what failed
    expect(mockMarkFailed).toHaveBeenCalledWith(
      expect.anything(),
      "run-3",
      "no_data",
      "no fixture data"
    )
    expect(mockRenderPdfToBuffer).not.toHaveBeenCalled()
  })
})
