import { describe, expect, it, vi } from "vitest"

import type { MySection } from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const mockListMySections = vi.fn()
vi.mock("./academics", () => ({
  listMySections: mockListMySections,
}))

const { getBasicHome } = await import("./basic-home")

const CTX: WorkspaceContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  role: "teacher",
  workspaceType: "school",
  plan: "pro",
}

type DayJsonSection = {
  section_id: string
  section_name: string
  grade_name: string
  grade_name_bn: string | null
  class_teacher_name: string | null
  is_mine: boolean
  enrolled: number
  session: {
    id: string
    updated_at: string
    taken_at: string
    taken_by_name: string | null
    expected: number
    present: number
    absent: number
    late: number
    excused: number
    half_day: number
    bulk_marked: boolean
  } | null
}

/** Narrowest stand-in covering the two calls `getBasicHome` itself makes
 * (`attendance_day` RPC, the caller's `profiles` row) — `listMySections` is
 * mocked above, not re-tested here (it has its own suite in
 * `academics.test.ts`). */
function fakeClient(options: {
  isSchoolDay?: boolean
  sections?: DayJsonSection[]
  rpcError?: boolean
  profileFullName?: string | null
  profileError?: boolean
}): AcadigmaSupabaseClient {
  const {
    isSchoolDay = true,
    sections = [],
    rpcError = false,
    profileFullName = "Rahima Khatun",
    profileError = false,
  } = options

  return {
    rpc: async (fn: string) => {
      if (fn !== "attendance_day") throw new Error(`unexpected rpc ${fn}`)
      if (rpcError) return { data: null, error: { message: "down" } }
      return {
        data: {
          date: "2026-09-27",
          today: "2026-09-27",
          is_school_day: isSchoolDay,
          edit_window_days: 2,
          sections,
        },
        error: null,
      }
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: profileError ? null : { full_name: profileFullName },
                error: profileError ? { message: "down" } : null,
              }),
            }),
          }),
        }
      }
      throw new Error(`fake supabase client: unexpected table "${table}"`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

function section(
  overrides: Partial<DayJsonSection> & { section_id: string }
): DayJsonSection {
  return {
    section_name: "ক",
    grade_name: "Class 6",
    grade_name_bn: "ষষ্ঠ শ্রেণি",
    class_teacher_name: null,
    is_mine: false,
    enrolled: 40,
    session: null,
    ...overrides,
  }
}

function mySection(
  overrides: Partial<MySection> & { sectionId: string }
): MySection {
  return {
    sectionName: "ক",
    gradeLevelId: "grade-1",
    gradeName: "Class 6",
    gradeNameBn: "ষষ্ঠ শ্রেণি",
    levelNumber: 6,
    isClassTeacher: false,
    subjects: [],
    ...overrides,
  }
}

describe("getBasicHome", () => {
  it("combines listMySections with attendance_day's per-section enrolled count and session", async () => {
    mockListMySections.mockResolvedValueOnce({
      ok: true,
      data: [
        mySection({ sectionId: "s1", isClassTeacher: true }),
        mySection({
          sectionId: "s2",
          sectionName: "খ",
          gradeName: "Class 7",
          subjects: [{ subjectId: "sub1", name: "Bangla", nameBn: "বাংলা" }],
        }),
      ],
    })
    const s1 = section({ section_id: "s1", is_mine: true })
    const s2 = section({
      section_id: "s2",
      section_name: "খ",
      grade_name: "Class 7",
    })
    const client = fakeClient({ sections: [s1, s2] })

    const result = await getBasicHome(client, CTX)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.classes).toHaveLength(2)
    expect(result.data.classes[0]).toMatchObject({
      sectionId: "s1",
      isClassTeacher: true,
      attendanceToday: "not_taken",
    })
    expect(result.data.classes[1]).toMatchObject({
      sectionId: "s2",
      subjects: [{ subjectId: "sub1", name: "Bangla", nameBn: "বাংলা" }],
    })
    expect(result.data.fullName).toBe("Rahima Khatun")
    expect(result.data.todayIso).toBe("2026-09-27")
  })

  it("counts a roll-call to-do only for the caller's own not-yet-taken section", async () => {
    mockListMySections.mockResolvedValueOnce({
      ok: true,
      data: [mySection({ sectionId: "s1", isClassTeacher: true })],
    })
    const mine = section({ section_id: "s1", is_mine: true })
    const notMine = section({ section_id: "s2", is_mine: false })
    const client = fakeClient({ sections: [mine, notMine] })

    const result = await getBasicHome(client, CTX)
    expect(result.ok && result.data.todos).toEqual([
      { kind: "roll_calls_not_taken", count: 1 },
    ])
  })

  it("shows no to-dos on a non-school day", async () => {
    mockListMySections.mockResolvedValueOnce({
      ok: true,
      data: [mySection({ sectionId: "s1", isClassTeacher: true })],
    })
    const mine = section({ section_id: "s1", is_mine: true })
    const client = fakeClient({ sections: [mine], isSchoolDay: false })

    const result = await getBasicHome(client, CTX)
    expect(result.ok && result.data.todos).toEqual([])
  })

  it("sets showAllClasses for owner/admin but not teacher/staff", async () => {
    mockListMySections.mockResolvedValue({ ok: true, data: [] })
    const client = fakeClient({ sections: [] })
    const teacher = await getBasicHome(client, CTX)
    expect(teacher.ok && teacher.data.showAllClasses).toBe(false)

    const admin = await getBasicHome(client, { ...CTX, role: "admin" })
    expect(admin.ok && admin.data.showAllClasses).toBe(true)

    const owner = await getBasicHome(client, { ...CTX, role: "owner" })
    expect(owner.ok && owner.data.showAllClasses).toBe(true)
  })

  it("propagates dependency_unavailable from listMySections", async () => {
    mockListMySections.mockResolvedValueOnce({
      ok: false,
      error: { code: "dependency_unavailable", message: "down" },
    })
    const client = fakeClient({ sections: [] })
    const result = await getBasicHome(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })

  it("propagates dependency_unavailable from the attendance_day RPC", async () => {
    mockListMySections.mockResolvedValueOnce({ ok: true, data: [] })
    const client = fakeClient({ rpcError: true })
    const result = await getBasicHome(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })

  it("propagates dependency_unavailable when the caller's profile cannot be read", async () => {
    mockListMySections.mockResolvedValueOnce({ ok: true, data: [] })
    const client = fakeClient({ profileError: true })
    const result = await getBasicHome(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})
