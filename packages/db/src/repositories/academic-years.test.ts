import { describe, expect, it } from "vitest"

import {
  createAcademicYear,
  createTerm,
  deleteTerm,
  getExamWeights,
  listAcademicYears,
  listTerms,
  setCurrentAcademicYear,
  updateExamWeights,
} from "./academic-years"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX: WorkspaceContext = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
  role: "admin",
  workspaceType: "school",
  plan: "pro",
}

const YEAR_ID = "11111111-1111-4111-8111-111111111111"
const TERM_ID = "22222222-2222-4222-8222-222222222222"

type QueryResult = {
  data: unknown
  error: { code?: string; message: string } | null
}
type Recorded = { op: string; args: unknown[] }[]

/**
 * A chainable stand-in for the supabase-js builder (`calendar.test.ts`'s
 * pattern), extended with a result queue: each top-level `.from(...)` call
 * consumes the next queued result at whichever terminal method the chain
 * ends on (`.single()`, `.maybeSingle()`, or awaiting the builder directly
 * for an array). `.rpc(...)` resolves to its own separate result.
 */
function fakeClient(
  queue: QueryResult[],
  rpcResult?: QueryResult
): { client: AcadigmaSupabaseClient; calls: Recorded } {
  const calls: Recorded = []
  let i = 0
  const next = (): QueryResult =>
    queue[i++] ?? { data: null, error: { message: "no queued result" } }

  const builder: Record<string, unknown> = {}
  for (const op of ["select", "eq", "order", "insert", "update", "delete"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args })
      return builder
    }
  }
  builder["single"] = async () => next()
  builder["maybeSingle"] = async () => next()
  builder["then"] = (resolve: (v: unknown) => unknown) => resolve(next())

  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] })
      return builder
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ op: "rpc", args: [name, args] })
      return Promise.resolve(
        rpcResult ?? { data: null, error: { message: "no rpc result" } }
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
  return { client, calls }
}

describe("listAcademicYears", () => {
  it("maps rows to the camelCase summary", async () => {
    const { client } = fakeClient([
      {
        data: [
          {
            id: YEAR_ID,
            name: "2026",
            starts_on: "2026-01-01",
            ends_on: "2026-12-31",
            is_current: true,
          },
        ],
        error: null,
      },
    ])
    const result = await listAcademicYears(CTX, client)
    expect(result.ok && result.data[0]).toEqual({
      id: YEAR_ID,
      name: "2026",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      isCurrent: true,
    })
  })
})

describe("createAcademicYear", () => {
  const input = { name: "2027", startsOn: "2027-01-01", endsOn: "2027-12-31" }

  it("rejects an invalid range before touching the database", async () => {
    const { client, calls } = fakeClient([])
    const result = await createAcademicYear(CTX, client, {
      name: "2027",
      startsOn: "2027-12-31",
      endsOn: "2027-01-01",
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(calls.find((c) => c.op === "insert")).toBeUndefined()
  })

  it("inserts into the caller's workspace", async () => {
    const { client, calls } = fakeClient([
      {
        data: {
          id: YEAR_ID,
          name: "2027",
          starts_on: "2027-01-01",
          ends_on: "2027-12-31",
          is_current: false,
        },
        error: null,
      },
    ])
    const result = await createAcademicYear(CTX, client, input)
    expect(result.ok).toBe(true)
    const insert = calls.find((c) => c.op === "insert")
    expect(insert?.args[0]).toMatchObject({
      workspace_id: CTX.workspaceId,
      name: "2027",
      created_by: CTX.userId,
    })
  })

  it("maps a duplicate name to conflict", async () => {
    const { client } = fakeClient([
      { data: null, error: { code: "23505", message: "dup" } },
    ])
    const result = await createAcademicYear(CTX, client, input)
    expect(!result.ok && result.error.code).toBe("conflict")
  })
})

describe("setCurrentAcademicYear", () => {
  it("calls the RPC with the workspace and year ids", async () => {
    const { client, calls } = fakeClient([], { data: YEAR_ID, error: null })
    const result = await setCurrentAcademicYear(CTX, client, YEAR_ID)
    expect(result.ok).toBe(true)
    expect(calls).toContainEqual({
      op: "rpc",
      args: [
        "set_current_academic_year",
        { p_workspace_id: CTX.workspaceId, p_academic_year_id: YEAR_ID },
      ],
    })
  })

  it("maps the not-found message to not_found", async () => {
    const { client } = fakeClient([], {
      data: null,
      error: { message: "academic year not found" },
    })
    const result = await setCurrentAcademicYear(CTX, client, YEAR_ID)
    expect(!result.ok && result.error.code).toBe("not_found")
  })

  it("maps any other RPC error to dependency_unavailable", async () => {
    const { client } = fakeClient([], {
      data: null,
      error: { message: "connection reset" },
    })
    const result = await setCurrentAcademicYear(CTX, client, YEAR_ID)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("listTerms", () => {
  it("maps rows to the camelCase Term", async () => {
    const { client } = fakeClient([
      {
        data: [
          {
            id: TERM_ID,
            academic_year_id: YEAR_ID,
            name: "1st Term",
            starts_on: "2026-01-01",
            ends_on: "2026-04-30",
          },
        ],
        error: null,
      },
    ])
    const result = await listTerms(CTX, client, YEAR_ID)
    expect(result.ok && result.data[0]).toEqual({
      id: TERM_ID,
      academicYearId: YEAR_ID,
      name: "1st Term",
      startsOn: "2026-01-01",
      endsOn: "2026-04-30",
    })
  })
})

describe("createTerm", () => {
  const input = {
    academicYearId: YEAR_ID,
    name: "1st Term",
    startsOn: "2026-01-01",
    endsOn: "2026-04-30",
  }

  it("returns not_found when the academic year does not exist", async () => {
    const { client } = fakeClient([{ data: null, error: null }])
    const result = await createTerm(CTX, client, input)
    expect(!result.ok && result.error.code).toBe("not_found")
  })

  it("rejects a term outside the year's range, without inserting", async () => {
    const { client, calls } = fakeClient([
      { data: { starts_on: "2026-01-01", ends_on: "2026-12-31" }, error: null },
      { data: [], error: null },
    ])
    const result = await createTerm(CTX, client, {
      ...input,
      startsOn: "2025-12-01",
    })
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(calls.find((c) => c.op === "insert")).toBeUndefined()
  })

  it("rejects a term overlapping an existing one, without inserting", async () => {
    const { client, calls } = fakeClient([
      { data: { starts_on: "2026-01-01", ends_on: "2026-12-31" }, error: null },
      {
        data: [
          {
            id: "other-term",
            academic_year_id: YEAR_ID,
            name: "2nd Term",
            starts_on: "2026-04-01",
            ends_on: "2026-08-31",
          },
        ],
        error: null,
      },
    ])
    const result = await createTerm(CTX, client, input)
    expect(!result.ok && result.error.code).toBe("validation_failed")
    expect(calls.find((c) => c.op === "insert")).toBeUndefined()
  })

  it("inserts a valid term into the caller's workspace", async () => {
    const { client, calls } = fakeClient([
      { data: { starts_on: "2026-01-01", ends_on: "2026-12-31" }, error: null },
      { data: [], error: null },
      {
        data: {
          id: TERM_ID,
          academic_year_id: YEAR_ID,
          name: "1st Term",
          starts_on: "2026-01-01",
          ends_on: "2026-04-30",
        },
        error: null,
      },
    ])
    const result = await createTerm(CTX, client, input)
    expect(result.ok).toBe(true)
    const insert = calls.find((c) => c.op === "insert")
    expect(insert?.args[0]).toMatchObject({
      workspace_id: CTX.workspaceId,
      academic_year_id: YEAR_ID,
      created_by: CTX.userId,
    })
  })

  it("maps a duplicate term name to conflict", async () => {
    const { client } = fakeClient([
      { data: { starts_on: "2026-01-01", ends_on: "2026-12-31" }, error: null },
      { data: [], error: null },
      { data: null, error: { code: "23505", message: "dup" } },
    ])
    const result = await createTerm(CTX, client, input)
    expect(!result.ok && result.error.code).toBe("conflict")
  })
})

describe("deleteTerm", () => {
  it("deletes within the workspace", async () => {
    const { client, calls } = fakeClient([
      { data: [{ id: TERM_ID }], error: null },
    ])
    const result = await deleteTerm(CTX, client, TERM_ID)
    expect(result.ok).toBe(true)
    expect(calls).toContainEqual({ op: "eq", args: ["id", TERM_ID] })
  })

  it("returns not_found when nothing was deleted", async () => {
    const { client } = fakeClient([{ data: [], error: null }])
    const result = await deleteTerm(CTX, client, TERM_ID)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("getExamWeights", () => {
  it("returns the stored map", async () => {
    const { client } = fakeClient([
      { data: { exam_weights: { "exam-1": 60, "exam-2": 40 } }, error: null },
    ])
    const result = await getExamWeights(CTX, client, YEAR_ID)
    expect(result.ok && result.data).toEqual({ "exam-1": 60, "exam-2": 40 })
  })

  it("returns not_found when the year does not exist", async () => {
    const { client } = fakeClient([{ data: null, error: null }])
    const result = await getExamWeights(CTX, client, YEAR_ID)
    expect(!result.ok && result.error.code).toBe("not_found")
  })

  it("defaults a null exam_weights to an empty map", async () => {
    const { client } = fakeClient([
      { data: { exam_weights: null }, error: null },
    ])
    const result = await getExamWeights(CTX, client, YEAR_ID)
    expect(result.ok && result.data).toEqual({})
  })
})

describe("updateExamWeights", () => {
  it("replaces the whole map and returns it", async () => {
    const { client, calls } = fakeClient([
      { data: [{ exam_weights: { "exam-1": 100 } }], error: null },
    ])
    const result = await updateExamWeights(CTX, client, YEAR_ID, {
      "exam-1": 100,
    })
    expect(result.ok && result.data).toEqual({ "exam-1": 100 })
    const update = calls.find((c) => c.op === "update")
    expect(update?.args[0]).toEqual({ exam_weights: { "exam-1": 100 } })
  })

  it("returns not_found when the year does not exist", async () => {
    const { client } = fakeClient([{ data: [], error: null }])
    const result = await updateExamWeights(CTX, client, YEAR_ID, {})
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})
