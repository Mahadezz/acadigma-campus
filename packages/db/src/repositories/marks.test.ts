import { describe, expect, it } from "vitest"

import { getMarkSheet, saveMarks } from "./marks"

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

const PAPER = "33333333-3333-4333-8333-333333333333"
const MEMBER = "44444444-4444-4444-8444-444444444444"
const S1 = "55555555-5555-4555-8555-555555555551"
const S2 = "55555555-5555-4555-8555-555555555552"

function paper(teacherId: string | null, classTeacherId: string | null) {
  return {
    id: PAPER,
    exam_id: "e",
    section_id: "sec",
    full_marks: "50.00",
    pass_marks: "16.50",
    status: "entering",
    teacher_id: teacherId,
    exams: { name: "Half-Yearly", status: "marks_entry" },
    subjects: { name: "Mathematics", name_bn: "গণিত" },
    sections: {
      name: "A",
      class_teacher_id: classTeacherId,
      grade_levels: { name: "Class 6" },
    },
  }
}

function sheetClient(p: ReturnType<typeof paper>, marks: unknown[] = []) {
  return fakeClient({
    exam_subjects: [{ data: p, error: null }],
    workspace_members: [{ data: { id: MEMBER }, error: null }],
    enrollments: [
      {
        data: [
          {
            roll_number: 1,
            students: { id: S1, full_name: "Ayaan R", full_name_bn: null },
          },
          {
            roll_number: 2,
            students: { id: S2, full_name: "Bina K", full_name_bn: null },
          },
        ],
        error: null,
      },
    ],
    marks: [{ data: marks, error: null }],
  })
}

describe("getMarkSheet", () => {
  it("lists enrolled students with their saved marks, scoped to the paper", async () => {
    const { client, calls } = sheetClient(paper(MEMBER, null), [
      {
        student_id: S1,
        status: "entered",
        obtained: "40.50",
        updated_at: "t1",
      },
    ])
    const result = await getMarkSheet(CTX, client, PAPER)
    expect(result.ok && result.data).toMatchObject({
      fullMarks: 50,
      passMarks: 16.5,
      canEnter: true,
      rows: [
        {
          studentId: S1,
          rollNumber: 1,
          status: "entered",
          obtained: 40.5,
          updatedAt: "t1",
        },
        {
          studentId: S2,
          rollNumber: 2,
          status: null,
          obtained: null,
          updatedAt: null,
        },
      ],
    })
    const marks = calls.find((c) => c.table === "marks")
    expect(marks?.ops).toContainEqual(["eq", ["exam_subject_id", PAPER]])
    expect(marks?.ops).toContainEqual(["eq", ["workspace_id", CTX.workspaceId]])
  })

  it("a teacher who is neither the paper's nor the class teacher cannot enter", async () => {
    const { client } = sheetClient(paper("other", "other2"))
    const result = await getMarkSheet(CTX, client, PAPER)
    expect(result.ok && result.data.canEnter).toBe(false)
  })

  it("the class teacher can enter", async () => {
    const { client } = sheetClient(paper(null, MEMBER))
    const result = await getMarkSheet(CTX, client, PAPER)
    expect(result.ok && result.data.canEnter).toBe(true)
  })

  it("an unknown paper is not_found", async () => {
    const { client } = fakeClient({
      exam_subjects: [{ data: null, error: null }],
      workspace_members: [{ data: null, error: null }],
    })
    const result = await getMarkSheet(CTX, client, PAPER)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("saveMarks", () => {
  const INPUT = {
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    examSubjectId: PAPER,
    entries: [
      {
        studentId: S1,
        status: "entered" as const,
        obtained: 45,
        expectedUpdatedAt: "t1",
      },
      {
        studentId: S2,
        status: "absent" as const,
        obtained: null,
        expectedUpdatedAt: null,
      },
    ],
  }

  it("sends snake_case entries and maps saved and rejected rows", async () => {
    const { client, rpcCalls } = fakeClient(
      {},
      {
        data: {
          saved: 1,
          entered: 2,
          enrolled: 2,
          rejected: [{ student_id: S1, issue: "CONFLICT" }],
          marks: [
            {
              student_id: S2,
              status: "absent",
              obtained: null,
              updated_at: "t2",
            },
          ],
        },
        error: null,
      }
    )
    const result = await saveMarks(CTX, client, INPUT)
    expect(rpcCalls[0]).toEqual([
      "save_marks",
      {
        p_workspace_id: CTX.workspaceId,
        p_input: {
          idempotency_key: INPUT.idempotencyKey,
          exam_subject_id: PAPER,
          entries: [
            {
              student_id: S1,
              status: "entered",
              obtained: 45,
              expected_updated_at: "t1",
            },
            {
              student_id: S2,
              status: "absent",
              obtained: null,
              expected_updated_at: null,
            },
          ],
        },
      },
    ])
    expect(result.ok && result.data).toEqual({
      saved: 1,
      entered: 2,
      enrolled: 2,
      rejected: [{ studentId: S1, issue: "CONFLICT" }],
      marks: [
        { studentId: S2, status: "absent", obtained: null, updatedAt: "t2" },
      ],
    })
  })

  it.each([
    ["NOT_ASSIGNED", "forbidden"],
    ["ENTRY_CLOSED", "conflict"],
    ["SUBJECT_LOCKED", "forbidden"],
    ["STUDENT_NOT_ENROLLED", "conflict"],
    ["something else", "dependency_unavailable"],
  ])("maps %s to %s", async (message, code) => {
    const { client } = fakeClient({}, { data: null, error: { message } })
    const result = await saveMarks(CTX, client, INPUT)
    expect(!result.ok && result.error.code).toBe(code)
  })
})
