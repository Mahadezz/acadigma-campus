import { describe, expect, it } from "vitest"

import {
  computeResults,
  getReportCard,
  getSectionResults,
  listFamilyResults,
  publishResults,
} from "./results"

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
        exam_subject_id: "p-science",
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
        exam_subject_id: "p-bangla",
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
      {
        data: { computed: 12, passed: 8, failed: 3, incomplete: 1 },
        error: null,
      }
    )
    expect(await computeResults(CTX, client, EXAM)).toEqual({
      ok: true,
      data: { computed: 12, passed: 8, failed: 3, incomplete: 1 },
    })
    expect(rpcCalls).toEqual([
      ["compute_results", { p_workspace_id: CTX.workspaceId, p_exam_id: EXAM }],
    ])
  })

  it("maps the database's named refusals", async () => {
    for (const [message, code] of [
      ["MARKS_NOT_LOCKED", "conflict"],
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
        { data: { frozen_payload: null }, error: null },
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

  it("a student without a roll number or attendance still gets a card", async () => {
    const { client } = fakeClient({
      results: [
        { data: { frozen_payload: null }, error: null },
        { data: { ...card, enrollments: { roll_number: null } }, error: null },
        { data: null, error: null, count: 38 },
        { data: null, error: null, count: 1 },
      ],
      attendance_records: [{ data: [], error: null }],
      school_profiles: [{ data: null, error: null }],
    })
    const r = await getReportCard(CTX, client, "x", EXAM)
    if (!r.ok) throw new Error("expected ok")
    expect(r.data.rollNumber).toBeNull()
    expect(r.data.rankTied).toBe(false)
    expect(r.data.attendance).toEqual({
      presentDays: 0,
      totalDays: 0,
      percent: null,
      belowMinimum: false,
    })
  })
})

const FROZEN = {
  studentNameEn: "Student S1",
  studentNameBn: "Student S1",
  studentCode: "S1",
  rollNumber: 1,
  className: "Class 6",
  sectionName: "A",
  examNameEn: "Half-Yearly",
  examNameBn: "Half-Yearly",
  subjects: [
    {
      subjectNameEn: "Science",
      subjectNameBn: "Science",
      subjectKind: "compulsory",
      status: "entered",
      marksObtained: 80,
      fullMarks: 100,
      letter: "A+",
      gradePoint: 5,
    },
  ],
  totalObtained: 80,
  totalFull: 100,
  percentage: 80,
  gpa: 5,
  gpaWithoutOptional: null,
  overallLetter: "A+",
  result: "pass",
  rank: 1,
  rankTied: false,
  rankOf: 3,
  attendance: {
    presentDays: 0,
    totalDays: 0,
    percent: null,
    belowMinimum: false,
  },
}

describe("published results (D-306)", () => {
  it("getReportCard prints a published result from its frozen payload, reading nothing else", async () => {
    const { client } = fakeClient({
      results: [{ data: { frozen_payload: FROZEN }, error: null }],
    })
    const r = await getReportCard(CTX, client, "id-S1", EXAM)
    expect(r).toEqual({ ok: true, data: FROZEN })
  })

  it("getReportCard refuses a frozen payload that is not a report card", async () => {
    const { client } = fakeClient({
      results: [{ data: { frozen_payload: { gpa: 5 } }, error: null }],
    })
    const r = await getReportCard(CTX, client, "id-S1", EXAM)
    expect(!r.ok && r.error.code).toBe("dependency_unavailable")
  })

  it("publishResults sends the withheld students and maps named refusals", async () => {
    const ok = fakeClient(
      {},
      { data: { published: 2, withheld: 1 }, error: null }
    )
    expect(
      await publishResults(CTX, ok.client, EXAM, [
        { studentId: "id-S2", reason: "Fees due" },
      ])
    ).toEqual({ ok: true, data: { published: 2, withheld: 1 } })
    expect(ok.rpcCalls[0]).toEqual([
      "publish_results",
      {
        p_workspace_id: CTX.workspaceId,
        p_exam_id: EXAM,
        p_withhold: [{ student_id: "id-S2", reason: "Fees due" }],
      },
    ])

    for (const [code, apiCode] of [
      ["INCOMPLETE_PRESENT", "conflict"],
      ["NOT_COMPUTED", "conflict"],
      ["MARKS_INCOMPLETE", "conflict"],
      ["FORBIDDEN", "forbidden"],
      ["something else", "dependency_unavailable"],
    ] as const) {
      const refused = fakeClient({}, { data: null, error: { message: code } })
      const r = await publishResults(CTX, refused.client, EXAM, [])
      expect(!r.ok && r.error.code).toBe(apiCode)
    }
  })

  it("listFamilyResults returns the frozen cards RLS shows", async () => {
    const { client } = fakeClient({
      results: [
        {
          data: [
            {
              exam_id: EXAM,
              student_id: "id-S1",
              published_at: "2026-09-26T04:00:00+00:00",
              frozen_payload: FROZEN,
            },
          ],
          error: null,
        },
      ],
    })
    const r = await listFamilyResults(CTX, client)
    expect(r).toEqual({
      ok: true,
      data: [
        {
          examId: EXAM,
          studentId: "id-S1",
          publishedAt: "2026-09-26T04:00:00+00:00",
          card: FROZEN,
        },
      ],
    })
  })
})
