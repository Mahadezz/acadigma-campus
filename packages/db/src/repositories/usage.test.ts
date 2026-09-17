import { describe, expect, it } from "vitest"

import { checkLimit, getUsage, requireWritable } from "./usage"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"
const PLAN_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  role: "teacher",
  plan: "pro",
}

function queryResult(result: {
  data?: unknown
  error?: unknown
  count?: number | null
}) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (value: unknown) => void,
      reject: (reason: unknown) => void
    ) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

function fakeClient(byTable: Record<string, ReturnType<typeof queryResult>>) {
  return {
    from: (table: string) => byTable[table],
  } as unknown as AcadigmaSupabaseClient
}

const PRO_PLAN_ROW = {
  id: PLAN_ID,
  code: "pro",
  name: "Pro",
  tagline: null,
  description: null,
  sort_order: 30,
  is_public: true,
  is_contact_sales: false,
  currency: "BDT",
  setup_fee_paisa: 0,
  included_sms_per_month: 1000,
  trial_days: 30,
  status: "active",
  created_at: "2026-09-17T00:00:00Z",
  updated_at: "2026-09-17T00:00:00Z",
}

describe("getUsage", () => {
  it("joins plan_limits and usage_counters into {current, limit, overBy}", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { plan_id: PLAN_ID, plans: PRO_PLAN_ROW },
        error: null,
      }),
      plan_limits: queryResult({
        data: [
          { key: "max_students", value_int: 150 },
          { key: "max_teachers", value_int: null },
        ],
        error: null,
      }),
      usage_counters: queryResult({
        data: [{ key: "max_students", value: 340 }],
        error: null,
      }),
    })

    const result = await getUsage(CTX, client)
    expect(result).toEqual({
      ok: true,
      data: {
        max_students: { current: 340, limit: 150, overBy: 190 },
        max_teachers: { current: 0, limit: null, overBy: 0 },
      },
    })
  })

  it("propagates a plan lookup failure", async () => {
    const client = fakeClient({
      workspaces: queryResult({ data: null, error: { message: "timeout" } }),
    })
    const result = await getUsage(CTX, client)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("checkLimit", () => {
  it("delegates to assertWithinLimit and blocks a create at the boundary", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { plan_id: PLAN_ID, plans: PRO_PLAN_ROW },
        error: null,
      }),
      plan_limits: queryResult({
        data: [{ key: "max_students", value_int: 150 }],
        error: null,
      }),
      usage_counters: queryResult({ data: { value: 150 }, error: null }),
    })

    const result = await checkLimit(CTX, client, "max_students", 1)
    expect(result).toEqual({
      ok: false,
      error: {
        code: "LIMIT_EXCEEDED",
        limitKey: "max_students",
        limit: 150,
        current: 150,
        planCode: "pro",
        suggestedPlanCode: undefined,
      },
    })
  })

  it("allows a create under the limit", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { plan_id: PLAN_ID, plans: PRO_PLAN_ROW },
        error: null,
      }),
      plan_limits: queryResult({
        data: [{ key: "max_students", value_int: 150 }],
        error: null,
      }),
      usage_counters: queryResult({ data: { value: 100 }, error: null }),
    })

    const result = await checkLimit(CTX, client, "max_students", 1)
    expect(result.ok).toBe(true)
  })

  it("treats a missing usage row as zero usage", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { plan_id: PLAN_ID, plans: PRO_PLAN_ROW },
        error: null,
      }),
      plan_limits: queryResult({
        data: [{ key: "max_sections", value_int: 5 }],
        error: null,
      }),
      usage_counters: queryResult({ data: null, error: null }),
    })

    const result = await checkLimit(CTX, client, "max_sections", 1)
    expect(result.ok).toBe(true)
  })
})

describe("requireWritable — the PLAN_READ_ONLY guard (D-29)", () => {
  it("allows a write when access_mode is normal", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { access_mode: "normal", access_mode_reason: null },
        error: null,
      }),
    })
    const result = await requireWritable(CTX, client)
    expect(result).toEqual({ ok: true, data: undefined })
  })

  it("refuses a write with the reason when access_mode is read_only", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: {
          access_mode: "read_only",
          access_mode_reason: "over the student limit",
        },
        error: null,
      }),
    })
    const result = await requireWritable(CTX, client)
    expect(result).toEqual({
      ok: false,
      error: { code: "PLAN_READ_ONLY", reason: "over the student limit" },
    })
  })

  it("fails closed (refuses) when the workspace row cannot be read", async () => {
    const client = fakeClient({
      workspaces: queryResult({ data: null, error: { message: "timeout" } }),
    })
    const result = await requireWritable(CTX, client)
    expect(!result.ok && result.error.code).toBe("PLAN_READ_ONLY")
  })
})
