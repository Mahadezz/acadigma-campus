// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LEGAL_DOCUMENTS } from "@/lib/legal/documents"

const USER = { id: "11111111-1111-4111-8111-111111111111" }
const SCHOOL = "22222222-2222-4222-8222-222222222222"

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockGetUser = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

const mockResolve = vi.fn()
vi.mock("@acadigma/db", () => ({ resolveWorkspaceContext: mockResolve }))

const mockList = vi.fn()
const mockAccept = vi.fn()
vi.mock("@acadigma/db/repositories/legal", () => ({
  listLegalAcceptances: mockList,
  acceptLegalDocument: mockAccept,
}))

const { acceptLegalDocuments } = await import("./actions")

const V = {
  terms: LEGAL_DOCUMENTS.terms.version,
  privacy: LEGAL_DOCUMENTS.privacy.version,
  dpa: LEGAL_DOCUMENTS.dpa.version,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: USER } })
  mockResolve.mockResolvedValue({ ok: false, error: { code: "forbidden" } })
  mockList.mockResolvedValue({ ok: true, data: [] })
  mockAccept.mockResolvedValue({ ok: true, data: null })
})

describe("acceptLegalDocuments (D-115)", () => {
  it("records Terms and Privacy at the current versions, with no workspace", async () => {
    const result = await acceptLegalDocuments({
      terms: V.terms,
      privacy: V.privacy,
    })
    expect(result).toEqual({ ok: true, data: { redirectTo: "/app" } })
    expect(mockList).toHaveBeenCalledWith(expect.anything(), USER.id, null)
    expect(mockAccept.mock.calls.map((c) => c.slice(1))).toEqual([
      ["terms", V.terms, null],
      ["privacy", V.privacy, null],
    ])
  })

  it("records the DPA for the resolved school of its owner", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      data: { workspaceId: SCHOOL, workspaceType: "school", role: "owner" },
    })
    mockList.mockResolvedValue({
      ok: true,
      data: [
        { document: "terms", version: V.terms, workspaceId: null },
        { document: "privacy", version: V.privacy, workspaceId: null },
      ],
    })
    const result = await acceptLegalDocuments({ dpa: V.dpa })
    expect(result.ok).toBe(true)
    expect(mockList).toHaveBeenCalledWith(expect.anything(), USER.id, SCHOOL)
    expect(mockAccept.mock.calls.map((c) => c.slice(1))).toEqual([
      ["dpa", V.dpa, SCHOOL],
    ])
  })

  it("refuses when what was shown is not what is outstanding", async () => {
    const result = await acceptLegalDocuments({ terms: V.terms })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("conflict")
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it("refuses an old version shown before a deploy", async () => {
    const result = await acceptLegalDocuments({
      terms: V.terms,
      privacy: "2000-01-01",
    })
    expect(result.ok).toBe(false)
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it("a non-owner cannot send a DPA", async () => {
    const result = await acceptLegalDocuments({
      terms: V.terms,
      privacy: V.privacy,
      dpa: V.dpa,
    })
    expect(result.ok).toBe(false)
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it("rejects unknown keys and a signed-out caller", async () => {
    const bad = await acceptLegalDocuments({ seller_agreement: "x" })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe("validation_failed")

    mockGetUser.mockResolvedValue({ data: { user: null } })
    const out = await acceptLegalDocuments({ terms: V.terms })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.code).toBe("unauthenticated")
  })

  it("stops at the database's refusal", async () => {
    mockAccept.mockResolvedValueOnce({
      ok: false,
      error: { code: "forbidden", message: "no" },
    })
    const result = await acceptLegalDocuments({
      terms: V.terms,
      privacy: V.privacy,
    })
    expect(result.ok).toBe(false)
    expect(mockAccept).toHaveBeenCalledTimes(1)
  })
})
