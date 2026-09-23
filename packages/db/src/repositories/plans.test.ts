import { describe, expect, it } from "vitest"

import {
  getWorkspacePlan,
  listEnabledModules,
  listPublicPlans,
  getPlanLimits,
} from "./plans"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"
const PLAN_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  role: "teacher",
  workspaceType: "school",
  plan: "pro",
}

/**
 * A chainable stand-in for a supabase-js query builder. Every method returns the
 * same object, and the object is itself `then`-able, so `await` resolves to
 * `result` no matter where the test's code under test stops chaining — it does not
 * need to know whether the repository calls `.maybeSingle()` or awaits the builder
 * directly, only what the query should ultimately resolve to.
 */
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
  tagline: "The full operations suite",
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

describe("listPublicPlans", () => {
  it("maps plan rows with their embedded limits, modules and prices", async () => {
    const client = fakeClient({
      plans: queryResult({
        data: [
          {
            ...PRO_PLAN_ROW,
            plan_limits: [
              { plan_id: PLAN_ID, key: "max_students", value_int: 2500 },
            ],
            plan_modules: [
              { plan_id: PLAN_ID, module: "fees", is_enabled: true },
            ],
            plan_prices: [
              {
                id: "c1c1c1c1-0000-0000-0000-000000000001",
                plan_id: PLAN_ID,
                student_min: 0,
                student_max: 300,
                monthly_paisa: 799_900,
                yearly_paisa: 7_999_000,
                overage_per_student_paisa: 0,
                currency: "BDT",
              },
            ],
          },
        ],
        error: null,
      }),
    })

    const result = await listPublicPlans(client)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      code: "pro",
      limits: [{ planId: PLAN_ID, key: "max_students", valueInt: 2500 }],
      modules: [{ planId: PLAN_ID, module: "fees", isEnabled: true }],
    })
    expect(result.data[0]?.prices[0]?.monthlyPaisa).toBe(799_900)
  })

  it("reports a query error as dependency_unavailable rather than throwing", async () => {
    const client = fakeClient({
      plans: queryResult({
        data: null,
        error: { message: "connection reset" },
      }),
    })
    const result = await listPublicPlans(client)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })

  it("reports a malformed row as internal rather than returning bad data", async () => {
    const client = fakeClient({
      plans: queryResult({ data: [{ id: PLAN_ID }], error: null }),
    })
    const result = await listPublicPlans(client)
    expect(!result.ok && result.error.code).toBe("internal")
  })
})

describe("getWorkspacePlan", () => {
  it("resolves the plan embedded on workspaces.plan_id", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { plan_id: PLAN_ID, plans: PRO_PLAN_ROW },
        error: null,
      }),
    })
    const result = await getWorkspacePlan(CTX, client)
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ code: "pro" }),
    })
  })

  it("is not_found when the workspace has no plan row (should not happen, fails closed)", async () => {
    const client = fakeClient({
      workspaces: queryResult({
        data: { plan_id: null, plans: null },
        error: null,
      }),
    })
    const result = await getWorkspacePlan(CTX, client)
    expect(!result.ok && result.error.code).toBe("not_found")
  })

  it("is dependency_unavailable on a query error", async () => {
    const client = fakeClient({
      workspaces: queryResult({ data: null, error: { message: "timeout" } }),
    })
    const result = await getWorkspacePlan(CTX, client)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("listEnabledModules", () => {
  it("returns only the module keys, not the disabled ones (filtered server-side)", async () => {
    const client = fakeClient({
      plan_modules: queryResult({
        data: [
          { module: "academics", is_enabled: true },
          { module: "fees", is_enabled: true },
        ],
        error: null,
      }),
    })
    const result = await listEnabledModules(client, PLAN_ID)
    expect(result).toEqual({ ok: true, data: ["academics", "fees"] })
  })
})

describe("getPlanLimits", () => {
  it("builds a {key: value_int} map, preserving NULL as unlimited", async () => {
    const client = fakeClient({
      plan_limits: queryResult({
        data: [
          { key: "max_students", value_int: 2500 },
          { key: "max_teachers", value_int: null },
        ],
        error: null,
      }),
    })
    const result = await getPlanLimits(client, PLAN_ID)
    expect(result).toEqual({
      ok: true,
      data: { max_students: 2500, max_teachers: null },
    })
  })
})
