import { describe, expect, it } from "vitest"

import {
  admitStudent,
  getRosterStudent,
  getStudentPrivate,
  listRoster,
  ROSTER_PAGE_SIZE,
} from "./students"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "owner",
} as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown }
type Call = { table: string; ops: [string, unknown[]][] }

function fakeClient(
  replies: Record<string, Reply[]>,
  rpcReply: Reply = { data: null, error: null }
) {
  const calls: Call[] = []
  const rpcCalls: [string, unknown][] = []
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const chain: unknown = new Proxy(
        {},
        {
          get(_, prop: string) {
            if (prop === "then") {
              const reply = replies[table]?.shift() ?? {
                data: null,
                error: null,
              }
              return (resolve: (r: Reply) => void) => resolve(reply)
            }
            return (...args: unknown[]) => {
              call.ops.push([prop, args])
              return chain
            }
          },
        }
      )
      return chain
    },
    async rpc(name: string, args: unknown) {
      rpcCalls.push([name, args])
      return rpcReply
    },
  }
  return {
    client: client as unknown as AcadigmaSupabaseClient,
    calls,
    rpcCalls,
  }
}

const YEAR = "66666666-6666-4666-8666-666666666666"

const ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  student_code: "STU-2026-00001",
  full_name: "Rahim Uddin",
  full_name_bn: "রহিম উদ্দিন",
  gender: "male",
  status: "active",
  section_id: "44444444-4444-4444-8444-444444444444",
  roll_number: 1,
  section_name: "ক",
  grade_name: "Class 6",
  grade_name_bn: "ষষ্ঠ শ্রেণি",
}

describe("listRoster", () => {
  it("scopes to the workspace, hides soft-deleted rows and reads the roster view only", async () => {
    const { client, calls } = fakeClient({
      student_roster: [{ data: [ROW], error: null }],
    })
    const result = await listRoster(client, CTX, { page: 1 }, YEAR)
    expect(result.ok && result.data.students[0]?.studentCode).toBe(
      "STU-2026-00001"
    )
    expect(result.ok && result.data.hasMore).toBe(false)
    expect(calls[0]?.table).toBe("student_roster")
    expect(calls[0]?.ops).toContainEqual([
      "eq",
      ["workspace_id", CTX.workspaceId],
    ])
    expect(calls[0]?.ops).toContainEqual(["is", ["deleted_at", null]])
    expect(calls[0]?.ops).toContainEqual(["eq", ["academic_year_id", YEAR]])
    expect(calls[0]?.ops).toContainEqual(["range", [0, ROSTER_PAGE_SIZE]])
  })

  it("filters by section and searches names and code without PostgREST syntax", async () => {
    const { client, calls } = fakeClient({
      student_roster: [{ data: [], error: null }],
    })
    await listRoster(
      client,
      CTX,
      { page: 2, q: "Rah,im)_%", sectionId: ROW.section_id },
      YEAR
    )
    expect(calls[0]?.ops).toContainEqual(["eq", ["section_id", ROW.section_id]])
    expect(calls[0]?.ops).toContainEqual([
      "or",
      [
        "full_name.ilike.*Rah im*,full_name_bn.ilike.*Rah im*,student_code.ilike.*Rah im*",
      ],
    ])
    expect(calls[0]?.ops).toContainEqual([
      "range",
      [ROSTER_PAGE_SIZE, ROSTER_PAGE_SIZE * 2],
    ])
  })

  it("reports a further page from the one extra row", async () => {
    const rows = Array.from({ length: ROSTER_PAGE_SIZE + 1 }, (_, i) => ({
      ...ROW,
      id: `${i}`,
    }))
    const { client } = fakeClient({
      student_roster: [{ data: rows, error: null }],
    })
    const result = await listRoster(client, CTX, { page: 1 }, YEAR)
    expect(result.ok && result.data.students).toHaveLength(ROSTER_PAGE_SIZE)
    expect(result.ok && result.data.hasMore).toBe(true)
  })

  it("maps a database error to dependency_unavailable", async () => {
    const { client } = fakeClient({
      student_roster: [{ data: null, error: { message: "x" } }],
    })
    const result = await listRoster(client, CTX, { page: 1 }, YEAR)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("listRoster without a current year", () => {
  it("returns an empty roster without querying", async () => {
    const { client, calls } = fakeClient({})
    const result = await listRoster(client, CTX, { page: 1 }, null)
    expect(result).toEqual({ ok: true, data: { students: [], hasMore: false } })
    expect(calls).toHaveLength(0)
  })
})

describe("getRosterStudent", () => {
  it("returns not_found when RLS or the workspace hides the student", async () => {
    const { client } = fakeClient({
      student_roster: [{ data: null, error: null }],
    })
    const result = await getRosterStudent(client, CTX, ROW.id)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("getStudentPrivate", () => {
  it("is null (locked) when RLS returns no private row", async () => {
    const { client } = fakeClient({
      student_private_details: [{ data: null, error: null }],
      guardians: [{ data: [], error: null }],
    })
    const result = await getStudentPrivate(client, CTX, ROW.id)
    expect(result).toEqual({ ok: true, data: null })
  })

  it("returns date of birth and guardians when allowed", async () => {
    const { client, calls } = fakeClient({
      student_private_details: [
        { data: { date_of_birth: "2014-03-09" }, error: null },
      ],
      guardians: [
        {
          data: [
            {
              id: "g",
              relation: "father",
              full_name: "Karim Uddin",
              full_name_bn: null,
              phone: "+8801712345678",
              is_primary: true,
            },
          ],
          error: null,
        },
      ],
    })
    const result = await getStudentPrivate(client, CTX, ROW.id)
    expect(result.ok && result.data?.dateOfBirth).toBe("2014-03-09")
    expect(result.ok && result.data?.guardians[0]?.phone).toBe("+8801712345678")
    for (const call of calls) {
      expect(call.ops).toContainEqual(["eq", ["workspace_id", CTX.workspaceId]])
    }
  })
})

describe("admitStudent", () => {
  const INPUT = {
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    firstName: "Rahim",
    lastName: "Uddin",
    fullNameBn: null,
    gender: "male" as const,
    dateOfBirth: "2014-03-09",
    sectionId: ROW.section_id,
    guardian: {
      relation: "father" as const,
      fullName: "Karim Uddin",
      phone: "+8801712345678",
    },
  }

  it("calls admit_student with the workspace from the context", async () => {
    const { client, rpcCalls } = fakeClient(
      {},
      {
        data: {
          student_id: ROW.id,
          student_code: "STU-2026-00001",
          roll_number: 1,
        },
        error: null,
      }
    )
    const result = await admitStudent(client, CTX, INPUT)
    expect(result).toEqual({
      ok: true,
      data: { studentId: ROW.id, studentCode: "STU-2026-00001", rollNumber: 1 },
    })
    expect(rpcCalls[0]?.[0]).toBe("admit_student")
    expect(rpcCalls[0]?.[1]).toMatchObject({
      p_workspace_id: CTX.workspaceId,
      p_input: { roll_number: null, guardian: { phone: "+8801712345678" } },
    })
  })

  it("maps the named database errors", async () => {
    for (const [message, code, field] of [
      ["ROLL_TAKEN", "conflict", "rollNumber"],
      ["SECTION_ARCHIVED", "validation_failed", "sectionId"],
      ["YEAR_CLOSED", "validation_failed", "sectionId"],
      ["FORBIDDEN", "forbidden", undefined],
    ] as const) {
      const { client } = fakeClient({}, { data: null, error: { message } })
      const result = await admitStudent(client, CTX, INPUT)
      expect(!result.ok && result.error.code).toBe(code)
      if (field) {
        expect(!result.ok && result.error.fieldErrors?.[field]).toEqual([
          message,
        ])
      }
    }
  })

  it("never echoes an unknown database message", async () => {
    const { client } = fakeClient(
      {},
      { data: null, error: { message: "toString" } }
    )
    const result = await admitStudent(client, CTX, INPUT)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})
