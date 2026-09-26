import { describe, expect, it } from "vitest"

import { getBasicHome } from "./basic-home"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX: WorkspaceContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  role: "teacher",
  workspaceType: "school",
  plan: "pro",
}

const MEMBER_ID = "33333333-3333-3333-3333-333333333333"

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

/** Narrowest stand-in covering every call `getBasicHome` (and the
 * `getAttendanceDay`/`resolveMyAssignments` it composes) makes. */
function fakeClient(options: {
  isSchoolDay?: boolean
  sections?: DayJsonSection[]
  rpcError?: boolean
  profileFullName?: string | null
  profileError?: boolean
  memberId?: string | null
  memberError?: boolean
  examSubjects?: {
    section_id: string
    subjects: { name: string; name_bn: string | null } | null
  }[]
  examSubjectsError?: boolean
}): AcadigmaSupabaseClient {
  const {
    isSchoolDay = true,
    sections = [],
    rpcError = false,
    profileFullName = "Rahima Khatun",
    profileError = false,
    memberId = MEMBER_ID,
    memberError = false,
    examSubjects = [],
    examSubjectsError = false,
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
      if (table === "workspace_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: memberError || !memberId ? null : { id: memberId },
                    error: memberError ? { message: "down" } : null,
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === "exam_subjects") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: examSubjectsError ? null : examSubjects,
                error: examSubjectsError ? { message: "down" } : null,
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

describe("getBasicHome", () => {
  it("combines a class-teacher section with a subject-teacher section from exam_subjects", async () => {
    const s1 = section({ section_id: "s1", is_mine: true })
    const s2 = section({
      section_id: "s2",
      section_name: "খ",
      grade_name: "Class 7",
      is_mine: false,
    })
    const client = fakeClient({
      sections: [s1, s2],
      examSubjects: [
        { section_id: "s2", subjects: { name: "Bangla", name_bn: "বাংলা" } },
      ],
    })

    const result = await getBasicHome(client, CTX)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.classes).toHaveLength(2)
    expect(result.data.classes[0]).toMatchObject({
      sectionId: "s1",
      subject: null,
      attendanceToday: "not_taken",
    })
    expect(result.data.classes[1]).toMatchObject({
      sectionId: "s2",
      subject: "Bangla",
    })
    expect(result.data.fullName).toBe("Rahima Khatun")
    expect(result.data.todayIso).toBe("2026-09-27")
  })

  it("counts a roll-call to-do only for the caller's own not-yet-taken section", async () => {
    const mine = section({ section_id: "s1", is_mine: true })
    const notMine = section({ section_id: "s2", is_mine: false })
    const client = fakeClient({ sections: [mine, notMine] })

    const result = await getBasicHome(client, CTX)
    expect(result.ok && result.data.todos).toEqual([
      { kind: "roll_calls_not_taken", count: 1 },
    ])
  })

  it("shows no to-dos on a non-school day", async () => {
    const mine = section({ section_id: "s1", is_mine: true })
    const client = fakeClient({ sections: [mine], isSchoolDay: false })

    const result = await getBasicHome(client, CTX)
    expect(result.ok && result.data.todos).toEqual([])
  })

  it("sets showAllClasses for owner/admin but not teacher/staff", async () => {
    const client = fakeClient({ sections: [] })
    const teacher = await getBasicHome(client, CTX)
    expect(teacher.ok && teacher.data.showAllClasses).toBe(false)

    const admin = await getBasicHome(client, { ...CTX, role: "admin" })
    expect(admin.ok && admin.data.showAllClasses).toBe(true)

    const owner = await getBasicHome(client, { ...CTX, role: "owner" })
    expect(owner.ok && owner.data.showAllClasses).toBe(true)
  })

  it("still returns the caller's class-teacher sections when the membership lookup finds no active row", async () => {
    const mine = section({ section_id: "s1", is_mine: true })
    const client = fakeClient({ sections: [mine], memberId: null })

    const result = await getBasicHome(client, CTX)
    expect(result.ok && result.data.classes).toHaveLength(1)
  })

  it("propagates dependency_unavailable from the attendance_day RPC", async () => {
    const client = fakeClient({ rpcError: true })
    const result = await getBasicHome(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })

  it("propagates dependency_unavailable when the caller's profile cannot be read", async () => {
    const client = fakeClient({ profileError: true })
    const result = await getBasicHome(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })

  it("propagates dependency_unavailable when the exam_subjects query fails", async () => {
    const client = fakeClient({ examSubjectsError: true })
    const result = await getBasicHome(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})
