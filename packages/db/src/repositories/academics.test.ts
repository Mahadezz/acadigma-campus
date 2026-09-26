import { describe, expect, it, vi } from "vitest"

import {
  archiveSection,
  createSection,
  createSubjects,
  getClassesOverview,
  listClassTeacherOptions,
  listMySections,
  setSectionSubjects,
} from "./academics"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "owner",
} as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown }
type Call = { table: string; ops: [string, unknown[]][] }

/** A query builder that records every call and resolves to the reply
 * queued for its table (in order). */
function fakeClient(replies: Record<string, Reply[]>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      const chain = new Proxy(builder, {
        get(_, prop: string) {
          if (prop === "then") {
            const reply = replies[table]?.shift() ?? { data: null, error: null }
            return (resolve: (r: Reply) => void) => resolve(reply)
          }
          return (...args: unknown[]) => {
            call.ops.push([prop, args])
            return chain
          }
        },
      })
      return chain
    },
  }
  return { client: client as unknown as AcadigmaSupabaseClient, calls }
}

const YEAR = { id: "33333333-3333-4333-8333-333333333333", name: "2026" }
const C6 = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Class 6",
  name_bn: "ষষ্ঠ শ্রেণি",
  level_number: 6,
  stage: "secondary",
}
const SECTION_ROW = {
  id: "55555555-5555-4555-8555-555555555555",
  grade_level_id: C6.id,
  name: "A",
  class_teacher_id: null,
  room: "204",
  capacity: 40,
  class_teacher: null,
}

describe("getClassesOverview", () => {
  it("groups this year's live sections under their grade, scoped to the workspace", async () => {
    const { client, calls } = fakeClient({
      academic_years: [{ data: YEAR, error: null }],
      grade_levels: [{ data: [C6], error: null }],
      sections: [{ data: [SECTION_ROW], error: null }],
    })
    const result = await getClassesOverview(client, CTX)
    expect(result.ok && result.data.grades[0]?.sections[0]?.name).toBe("A")
    expect(result.ok && result.data.year?.name).toBe("2026")
    for (const call of calls) {
      expect(call.ops).toContainEqual(["eq", ["workspace_id", CTX.workspaceId]])
    }
    const sections = calls.find((c) => c.table === "sections")
    expect(sections?.ops).toContainEqual(["is", ["archived_at", null]])
  })

  it("returns grades with no sections when there is no current year", async () => {
    const { client, calls } = fakeClient({
      academic_years: [{ data: null, error: null }],
      grade_levels: [{ data: [C6], error: null }],
    })
    const result = await getClassesOverview(client, CTX)
    expect(result.ok && result.data.year).toBe(null)
    expect(calls.some((c) => c.table === "sections")).toBe(false)
  })
})

describe("createSection", () => {
  const input = { gradeLevelId: C6.id, name: "A" }

  it("inserts into the current year, stamped with the caller", async () => {
    const { client, calls } = fakeClient({
      academic_years: [{ data: YEAR, error: null }],
      sections: [{ data: SECTION_ROW, error: null }],
    })
    const result = await createSection(client, CTX, input)
    expect(result.ok).toBe(true)
    const insert = calls
      .find((c) => c.table === "sections")
      ?.ops.find(([op]) => op === "insert")?.[1][0] as Record<string, unknown>
    expect(insert).toMatchObject({
      workspace_id: CTX.workspaceId,
      academic_year_id: YEAR.id,
      created_by: CTX.userId,
    })
  })

  it.each([
    [
      {
        code: "23505",
        message: 'violates "sections_one_class_teacher_per_year"',
      },
      "CLASS_TEACHER_TAKEN",
    ],
    [
      { code: "23505", message: 'violates "sections_year_grade_name_key"' },
      "SECTION_NAME_TAKEN",
    ],
    [{ code: "22023", message: "MEMBER_NOT_ELIGIBLE" }, "MEMBER_NOT_ELIGIBLE"],
    [
      {
        code: "23503",
        message:
          'violates foreign key constraint "sections_class_teacher_fkey"',
      },
      "MEMBER_NOT_ELIGIBLE",
    ],
  ])("maps %o to %s", async (dbError, code) => {
    const { client } = fakeClient({
      academic_years: [{ data: YEAR, error: null }],
      sections: [{ data: null, error: dbError }],
    })
    const result = await createSection(client, CTX, input)
    expect(
      !result.ok && Object.values(result.error.fieldErrors ?? {})[0]
    ).toEqual([code])
  })

  it("refuses when the school has no current year", async () => {
    const { client } = fakeClient({
      academic_years: [{ data: null, error: null }],
    })
    const result = await createSection(client, CTX, input)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

it("maps a foreign grade (another FK) to a generic validation error, not the teacher field", async () => {
  const { client } = fakeClient({
    academic_years: [{ data: YEAR, error: null }],
    sections: [
      {
        data: null,
        error: {
          code: "23503",
          message:
            'violates foreign key constraint "sections_grade_level_fkey"',
        },
      },
    ],
  })
  const result = await createSection(client, CTX, {
    gradeLevelId: C6.id,
    name: "A",
  })
  expect(!result.ok && result.error.code).toBe("validation_failed")
  expect(!result.ok && result.error.fieldErrors).toBeUndefined()
})

describe("archiveSection", () => {
  it("reports not_found when nothing live matched", async () => {
    const { client } = fakeClient({ sections: [{ data: null, error: null }] })
    const result = await archiveSection(client, CTX, SECTION_ROW.id)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("listClassTeacherOptions", () => {
  it("only asks for active owners, admins and teachers, sorted by name", async () => {
    const { client, calls } = fakeClient({
      workspace_members: [
        {
          data: [
            { id: "b", profiles: { full_name: "Zara" } },
            { id: "a", profiles: { full_name: "Anis" } },
          ],
          error: null,
        },
      ],
    })
    const result = await listClassTeacherOptions(client, CTX)
    expect(result.ok && result.data.map((o) => o.name)).toEqual([
      "Anis",
      "Zara",
    ])
    expect(calls[0]?.ops).toContainEqual(["eq", ["status", "active"]])
    expect(calls[0]?.ops).toContainEqual([
      "in",
      ["role", ["owner", "admin", "teacher"]],
    ])
  })
})

describe("createSubjects", () => {
  it("does not touch the database for an empty list", async () => {
    const { client, calls } = fakeClient({})
    const result = await createSubjects(client, CTX, [])
    expect(result).toEqual({ ok: true, data: { created: 0 } })
    expect(calls).toHaveLength(0)
  })

  it("maps a duplicate to SUBJECT_TAKEN", async () => {
    const { client } = fakeClient({
      subjects: [{ data: null, error: { code: "23505", message: "dup" } }],
    })
    const result = await createSubjects(client, CTX, [
      { name: "Physics", category: "core", subjectKind: "compulsory" },
    ])
    expect(!result.ok && result.error.fieldErrors?.["name"]).toEqual([
      "SUBJECT_TAKEN",
    ])
  })
})

describe("setSectionSubjects (D-107)", () => {
  function rpcClient(reply: Reply) {
    const rpc = vi.fn(async () => reply)
    return { client: { rpc } as unknown as AcadigmaSupabaseClient, rpc }
  }
  const input = {
    sectionId: SECTION_ROW.id,
    subjects: [{ subjectId: C6.id, teacherId: null }],
  }

  it("sends the workspace, the section and snake_case rows", async () => {
    const { client, rpc } = rpcClient({ data: 1, error: null })
    const result = await setSectionSubjects(client, CTX, input)
    expect(result).toEqual({ ok: true, data: { count: 1 } })
    expect(rpc).toHaveBeenCalledWith("set_section_subjects", {
      p_workspace_id: CTX.workspaceId,
      p_section_id: SECTION_ROW.id,
      p_subjects: [{ subject_id: C6.id, teacher_id: null }],
    })
  })

  it.each([
    [{ code: "P0002", message: "SECTION_NOT_FOUND" }, "not_found", undefined],
    [
      { code: "22023", message: "SUBJECT_ARCHIVED" },
      "validation_failed",
      undefined,
    ],
    [
      { code: "22023", message: "MEMBER_NOT_ELIGIBLE" },
      "validation_failed",
      "MEMBER_NOT_ELIGIBLE",
    ],
    [
      { code: "23503", message: 'violates "section_subjects_subject_fkey"' },
      "validation_failed",
      undefined,
    ],
    [{ code: "XX000", message: "boom" }, "dependency_unavailable", undefined],
  ])("maps %o", async (error, code, field) => {
    const { client } = rpcClient({ data: null, error })
    const result = await setSectionSubjects(client, CTX, input)
    expect(!result.ok && result.error.code).toBe(code)
    expect(!result.ok && result.error.fieldErrors?.teacherId?.[0]).toBe(field)
  })
})

describe("listMySections (D-107)", () => {
  const MEMBER = { id: "66666666-6666-4666-8666-666666666666" }
  const GRADE = {
    id: C6.id,
    name: "Class 6",
    name_bn: "ষষ্ঠ শ্রেণি",
    level_number: 6,
  }
  const C7 = {
    ...GRADE,
    id: "77777777-7777-4777-8777-777777777777",
    name: "Class 7",
    level_number: 7,
  }
  const A6 = {
    id: "a6",
    name: "A",
    class_teacher_id: MEMBER.id,
    grade_levels: GRADE,
  }
  const B7 = { id: "b7", name: "B", class_teacher_id: null, grade_levels: C7 }

  it("merges class-teacher and subject-teacher sections, ordered by grade", async () => {
    const { client, calls } = fakeClient({
      academic_years: [{ data: YEAR, error: null }],
      workspace_members: [{ data: MEMBER, error: null }],
      sections: [{ data: [A6], error: null }],
      section_subjects: [
        {
          data: [
            {
              subject_id: "s2",
              subjects: { name: "Science", name_bn: null },
              sections: B7,
            },
            {
              subject_id: "s1",
              subjects: { name: "Bangla", name_bn: "বাংলা" },
              sections: A6,
            },
            {
              subject_id: "s3",
              subjects: { name: "English", name_bn: null },
              sections: B7,
            },
          ],
          error: null,
        },
      ],
    })
    const result = await listMySections(client, CTX)
    expect(result.ok && result.data).toEqual([
      {
        sectionId: "a6",
        sectionName: "A",
        gradeLevelId: C6.id,
        gradeName: "Class 6",
        gradeNameBn: "ষষ্ঠ শ্রেণি",
        levelNumber: 6,
        isClassTeacher: true,
        subjects: [{ subjectId: "s1", name: "Bangla", nameBn: "বাংলা" }],
      },
      {
        sectionId: "b7",
        sectionName: "B",
        gradeLevelId: C7.id,
        gradeName: "Class 7",
        gradeNameBn: "ষষ্ঠ শ্রেণি",
        levelNumber: 7,
        isClassTeacher: false,
        subjects: [
          { subjectId: "s3", name: "English", nameBn: null },
          { subjectId: "s2", name: "Science", nameBn: null },
        ],
      },
    ])
    for (const call of calls) {
      expect(call.ops).toContainEqual(["eq", ["workspace_id", CTX.workspaceId]])
    }
    expect(
      calls.find((c) => c.table === "workspace_members")?.ops
    ).toContainEqual(["eq", ["user_id", CTX.userId]])
    expect(calls.find((c) => c.table === "section_subjects")?.ops).toEqual(
      expect.arrayContaining([
        ["eq", ["teacher_id", MEMBER.id]],
        ["eq", ["sections.academic_year_id", YEAR.id]],
        ["is", ["sections.archived_at", null]],
      ])
    )
  })

  it("is empty with no current year or no active membership", async () => {
    for (const replies of [
      {
        academic_years: [{ data: null, error: null }],
        workspace_members: [{ data: MEMBER, error: null }],
      },
      {
        academic_years: [{ data: YEAR, error: null }],
        workspace_members: [{ data: null, error: null }],
      },
    ]) {
      const { client, calls } = fakeClient(replies)
      const result = await listMySections(client, CTX)
      expect(result).toEqual({ ok: true, data: [] })
      expect(calls.some((c) => c.table === "section_subjects")).toBe(false)
    }
  })

  it("fails closed when a read fails", async () => {
    const { client } = fakeClient({
      academic_years: [{ data: YEAR, error: null }],
      workspace_members: [{ data: MEMBER, error: null }],
      sections: [{ data: null, error: { message: "x" } }],
    })
    const result = await listMySections(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})
