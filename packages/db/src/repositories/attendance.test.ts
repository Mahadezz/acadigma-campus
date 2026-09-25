import { describe, expect, it } from "vitest"

import { getAttendanceDay, getRollCall, saveAttendance } from "./attendance"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "teacher",
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

const SECTION = "33333333-3333-4333-8333-333333333333"
const SESSION = "44444444-4444-4444-8444-444444444444"
const STUDENT = "55555555-5555-4555-8555-555555555555"

describe("getAttendanceDay", () => {
  it("maps the overview, including a section's session counts", async () => {
    const { client, rpcCalls } = fakeClient(
      {},
      {
        data: {
          date: "2026-09-25",
          today: "2026-09-25",
          is_school_day: true,
          edit_window_days: 2,
          sections: [
            {
              section_id: SECTION,
              section_name: "ক",
              grade_name: "Class 6",
              grade_name_bn: "ষষ্ঠ শ্রেণি",
              class_teacher_name: "Nadia",
              is_mine: true,
              enrolled: 40,
              session: {
                id: SESSION,
                updated_at: "2026-09-25T03:10:00+00:00",
                taken_at: "2026-09-25T03:10:00+00:00",
                taken_by_name: "Nadia",
                expected: 40,
                present: 37,
                absent: 3,
                late: 0,
                excused: 0,
                half_day: 0,
                bulk_marked: true,
              },
            },
          ],
        },
        error: null,
      }
    )
    const result = await getAttendanceDay(client, CTX)
    expect(result.ok && result.data.sections[0]?.session?.present).toBe(37)
    expect(result.ok && result.data.sections[0]?.session?.bulkMarked).toBe(true)
    expect(rpcCalls[0]).toEqual([
      "attendance_day",
      { p_workspace_id: CTX.workspaceId },
    ])
  })

  it("maps an error to dependency_unavailable", async () => {
    const { client } = fakeClient({}, { data: null, error: { message: "x" } })
    const result = await getAttendanceDay(client, CTX, "2026-09-24")
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("getRollCall", () => {
  const ENROLLED = {
    data: [
      {
        roll_number: 1,
        students: { id: STUDENT, full_name: "Rahim", full_name_bn: null },
      },
    ],
    error: null,
  }

  it("lists the enrolled students by roll with any saved status", async () => {
    const { client, calls } = fakeClient({
      enrollments: [ENROLLED],
      attendance_records: [
        { data: [{ student_id: STUDENT, status: "absent" }], error: null },
      ],
    })
    const result = await getRollCall(
      client,
      CTX,
      SECTION,
      "2026-09-25",
      SESSION
    )
    expect(result.ok && result.data[0]?.status).toBe("absent")
    const enrol = calls.find((c) => c.table === "enrollments")
    expect(enrol?.ops).toContainEqual(["eq", ["workspace_id", CTX.workspaceId]])
    expect(enrol?.ops).toContainEqual(["lte", ["enrolled_on", "2026-09-25"]])
    expect(enrol?.ops).toContainEqual(["eq", ["students.status", "active"]])
  })

  it("starts everyone unmarked when the day has no session (D-22)", async () => {
    const { client, calls } = fakeClient({ enrollments: [ENROLLED] })
    const result = await getRollCall(client, CTX, SECTION, "2026-09-25", null)
    expect(result.ok && result.data[0]?.status).toBeNull()
    expect(calls.some((c) => c.table === "attendance_records")).toBe(false)
  })
})

describe("saveAttendance", () => {
  const INPUT = {
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    sectionId: SECTION,
    date: "2026-09-25",
    records: [{ studentId: STUDENT, status: "present" as const }],
    bulkMarked: true,
    allowNonSchoolDay: false,
    expectedUpdatedAt: null,
  }

  it("calls save_attendance with the workspace from the context", async () => {
    const { client, rpcCalls } = fakeClient(
      {},
      {
        data: {
          session_id: SESSION,
          updated_at: "t",
          expected: 1,
          present: 1,
          absent: 0,
          late: 0,
          excused: 0,
          half_day: 0,
        },
        error: null,
      }
    )
    const result = await saveAttendance(client, CTX, INPUT)
    expect(result.ok && result.data.present).toBe(1)
    expect(rpcCalls[0]?.[1]).toMatchObject({
      p_workspace_id: CTX.workspaceId,
      p_input: {
        bulk_marked: true,
        records: [{ student_id: STUDENT, status: "present" }],
      },
    })
  })

  it("maps the named database errors and never echoes an unknown one", async () => {
    for (const [message, code] of [
      ["NOT_ASSIGNED", "forbidden"],
      ["OUTSIDE_EDIT_WINDOW", "forbidden"],
      ["CONFLICT", "conflict"],
      ["UNMARKED_STUDENTS", "validation_failed"],
      ["constructor", "dependency_unavailable"],
    ] as const) {
      const { client } = fakeClient({}, { data: null, error: { message } })
      const result = await saveAttendance(client, CTX, INPUT)
      expect(!result.ok && result.error.code).toBe(code)
    }
  })
})
