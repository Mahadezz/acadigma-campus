import { describe, expect, it, vi } from "vitest"

import type { ApiError, MySection, Result } from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const listMySectionsMock =
  vi.fn<(...a: unknown[]) => Promise<Result<MySection[], ApiError>>>()
vi.mock("./academics", () => ({
  listMySections: (...a: unknown[]) => listMySectionsMock(...a),
}))

const { getClassHub, isNotAssignedError } = await import("./class-hub")

const SECTION_ID = "55555555-5555-4555-8555-555555555555"
const OTHER_SECTION_ID = "66666666-6666-4666-8666-666666666666"

const SECTION_ROW = {
  id: SECTION_ID,
  name: "A",
  grade_levels: { name: "Class 6", name_bn: "ষষ্ঠ শ্রেণি" },
}

function ctx(role: WorkspaceContext["role"]): WorkspaceContext {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    role,
  } as unknown as WorkspaceContext
}

/**
 * `getClassHub`'s own two direct reads (`sections`, `student_roster`);
 * `listMySections` (the "am I assigned?" question) is unit-mocked above
 * rather than faked here — it already has its own dedicated coverage in
 * `academics.test.ts`, so this file only proves `getClassHub`'s own logic
 * (the gate, the header shape) against whatever that function returns.
 */
function fakeClient(options: {
  sectionRow?: typeof SECTION_ROW | null
  sectionError?: boolean
  studentCount?: number
  countError?: boolean
}): AcadigmaSupabaseClient {
  const {
    sectionRow = SECTION_ROW,
    sectionError = false,
    studentCount = 12,
    countError = false,
  } = options
  return {
    from: (table: string) => {
      if (table === "sections") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: sectionError ? null : sectionRow,
                    error: sectionError ? { message: "down" } : null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === "student_roster") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => ({
                  data: null,
                  error: countError ? { message: "down" } : null,
                  count: countError ? null : studentCount,
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

describe("getClassHub", () => {
  it("SECTION_NOT_FOUND when the section does not exist (or is archived / another workspace's)", async () => {
    listMySectionsMock.mockResolvedValue({ ok: true, data: [] })
    const client = fakeClient({ sectionRow: null })
    const result = await getClassHub(client, ctx("owner"), SECTION_ID)
    expect(!result.ok && result.error.code).toBe("not_found")
  })

  it("owner/admin bypass the assignment check entirely (never calls listMySections)", async () => {
    const client = fakeClient({})
    const result = await getClassHub(client, ctx("admin"), SECTION_ID)
    expect(listMySectionsMock).not.toHaveBeenCalled()
    expect(result.ok && result.data).toEqual({
      section: {
        id: SECTION_ID,
        name: "A",
        gradeName: "Class 6",
        gradeNameBn: "ষষ্ঠ শ্রেণি",
      },
      studentCount: 12,
      tabs: ["attendance", "marks", "students", "print"],
    })
  })

  it("NOT_ASSIGNED for a teacher whose listMySections does not include this section (§9 AC11)", async () => {
    listMySectionsMock.mockResolvedValue({
      ok: true,
      data: [{ sectionId: OTHER_SECTION_ID } as MySection],
    })
    const client = fakeClient({})
    const result = await getClassHub(client, ctx("teacher"), SECTION_ID)
    expect(result.ok).toBe(false)
    expect(!result.ok && isNotAssignedError(result.error)).toBe(true)
  })

  it("a teacher IS granted the hub for a section listMySections does include", async () => {
    listMySectionsMock.mockResolvedValue({
      ok: true,
      data: [{ sectionId: SECTION_ID } as MySection],
    })
    const client = fakeClient({})
    const result = await getClassHub(client, ctx("teacher"), SECTION_ID)
    expect(result.ok).toBe(true)
  })

  it("dependency_unavailable on a query error", async () => {
    listMySectionsMock.mockResolvedValue({ ok: true, data: [] })
    const client = fakeClient({ sectionError: true })
    const result = await getClassHub(client, ctx("owner"), SECTION_ID)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("isNotAssignedError", () => {
  it("is false for an ordinary error", () => {
    expect(isNotAssignedError({ code: "not_found", message: "x" })).toBe(false)
  })
})
