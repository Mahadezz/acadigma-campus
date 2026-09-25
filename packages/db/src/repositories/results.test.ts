import { describe, expect, it } from "vitest"

import { computeResults, getReportCard, getSectionResults } from "./results"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "owner",
} as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown; count?: number }

/** Each `from(table)` chain resolves to the next reply queued for that table. */
function fakeClient(
  replies: Record<string, Reply[]>,
  rpcReply: Reply = { data: null, error: null }
) {
  const rpcCalls: [string, unknown][] = []
  const client = {
    from(table: string) {
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
            return () => chain
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
  return { client: client as unknown as AcadigmaSupabaseClient, rpcCalls }
}

const EXAM = "33333333-3333-4333-8333-333333333333"

function result(code: string, rank: number | null, gpa: string | null) {
  return {
    student_id: `id-${code}`,
    section_id: "sec",
    total_obtained: "442.00",
    total_full: "550.00",
    percentage: gpa === null ? null : "80.36",
    gpa,
    gpa_without_optional: null,
    letter: gpa === null ? null : "A",
    result_status: "pass",
    failed_subjects: 0,
    section_rank: rank,
    computed_at: "2026-09-26T04:00:00Z",
    enrollments: { roll_number: 2 },
    students: {
      student_code: code,
      full_name: `Student ${code}`,
      full_name_bn: null,
    },
    result_subject_lines: [
      {
        subject_name: "Science",
        subject_name_bn: "বিজ্ঞান",
        full_marks: "100.00",
        status: "absent",
        subject_kind: "compulsory",
        obtained: null,
        percentage: "0.00",
        letter: "F",
        grade_point: "0.00",
        passed: false,
      },
      {
        subject_name: "Bangla",
        subject_name_bn: null,
        full_marks: "100.00",
        status: "entered",
        subject_kind: "compulsory",
        obtained: "75.00",
        percentage: "75.00",
        letter: "A",
        grade_point: "4.00",
        passed: true,
      },
    ],
  }
}

describe("computeResults", () => {
  it("calls public.compute_results and returns the summary", async () => {
    const { client, rpcCalls } = fakeClient(
      {},
      { data: { computed: 12, passed: 9, failed: 3 }, error: null }
    )
    expect(await computeResults(CTX, client, EXAM)).toEqual({
      ok: true,
      data: { computed: 12, passed: 9, failed: 3 },
    })
    expect(rpcCalls).toEqual([
      ["compute_results", { p_workspace_id: CTX.workspaceId, p_exam_id: EXAM }],
    ])
  })

  it("maps the database's named refusals", async () => {
    for (const [message, code] of [
      ["MARKS_NOT_LOCKED", "conflict"],
      ["MARKS_INCOMPLETE", "conflict"],
      ["FORBIDDEN", "forbidden"],
      ["something else", "dependency_unavailable"],
    ]) {
      const { client } = fakeClient({}, { data: null, error: { message } })
      const r = await computeResults(CTX, client, EXAM)
      expect(!r.ok && r.error.code).toBe(code)
    }
  })
})

describe("getSectionResults", () => {
  it("orders by rank, unranked last, with lines by subject name", async () => {
    const { client } = fakeClient({
      exams: [{ data: { id: EXAM, name: "Half-Yearly" }, error: null }],
      sections: [
        {
          data: { id: "sec", name: "A", grade_levels: { name: "Class 6" } },
          error: null,
        },
      ],
      results: [
        {
          data: [
            result("S3", null, null),
            result("S2", 2, "4.67"),
            result("S1", 1, "5.00"),
          ],
          error: null,
        },
      ],
    })
    const r = await getSectionResults(CTX, client, EXAM, "sec")
    if (!r.ok) throw new Error("expected ok")
    expect(r.data.rows.map((row) => row.studentCode)).toEqual([
      "S1",
      "S2",
      "S3",
    ])
    expect(r.data.rows[1]).toMatchObject({ gpa: 4.67, totalObtained: 442 })
    expect(r.data.rows[0]!.lines.map((l) => l.subjectName)).toEqual([
      "Bangla",
      "Science",
    ])
    expect(r.data.computedAt).toBe("2026-09-26T04:00:00Z")
  })
})

describe("getReportCard", () => {
  const card = {
    ...result("S2", 2, "4.67"),
    exams: {
      name: "Half-Yearly",
      ends_on: "2026-06-30",
      academic_years: { starts_on: "2026-01-01" },
    },
    sections: { name: "ক", grade_levels: { name: "Class 6" } },
  }
  const attendance = [
    ...Array.from({ length: 14 }, () => ({ status: "present" })),
    { status: "late" },
    { status: "half_day" },
    ...Array.from({ length: 4 }, () => ({ status: "absent" })),
  ]

  it("shapes the report card: absent has no mark, ties and class size, attendance by policy", async () => {
    const { client } = fakeClient({
      results: [
        { data: card, error: null },
        { data: null, error: null, count: 38 },
        { data: null, error: null, count: 2 },
      ],
      attendance_records: [{ data: attendance, error: null }],
      school_profiles: [
        {
          data: {
            attendance_policy: {
              late_counts_present: true,
              half_day_counts_present: false,
              min_attendance_bp: 8000,
            },
          },
          error: null,
        },
      ],
    })
    const r = await getReportCard(CTX, client, "id-S2", EXAM)
    if (!r.ok) throw new Error("expected ok")
    expect(r.data).toMatchObject({
      studentNameEn: "Student S2",
      studentNameBn: "Student S2",
      rollNumber: 2,
      className: "Class 6",
      sectionName: "ক",
      gpa: 4.67,
      gpaWithoutOptional: null,
      overallLetter: "A",
      result: "pass",
      rank: 2,
      rankTied: true,
      rankOf: 38,
      // 14 present + 1 late (counts) + half day (does not) = 15 of 20 = 75 %
      attendance: {
        presentDays: 15,
        totalDays: 20,
        percent: 75,
        belowMinimum: true,
      },
    })
    expect(r.data.subjects[1]).toEqual({
      subjectNameEn: "Science",
      subjectNameBn: "বিজ্ঞান",
      subjectKind: "compulsory",
      status: "absent",
      marksObtained: null,
      fullMarks: 100,
      letter: "F",
      gradePoint: 0,
    })
  })

  it("is not_found when RLS shows no result (another class, another school)", async () => {
    const { client } = fakeClient({ results: [{ data: null, error: null }] })
    const r = await getReportCard(CTX, client, "x", EXAM)
    expect(!r.ok && r.error.code).toBe("not_found")
  })

  it("has no card for a student without a roll number", async () => {
    const { client } = fakeClient({
      results: [
        { data: { ...card, enrollments: { roll_number: null } }, error: null },
      ],
    })
    const r = await getReportCard(CTX, client, "x", EXAM)
    expect(!r.ok && r.error.code).toBe("not_found")
  })
})
