import { describe, expect, it } from "vitest"

import { getSubscription, hasSubscription } from "./subscriptions"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"

const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  role: "owner",
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

describe("getSubscription", () => {
  it("maps a trialing Pro subscription", async () => {
    const client = fakeClient({
      subscriptions: queryResult({
        data: {
          status: "trialing",
          billing_interval: "monthly",
          current_period_start: "2026-09-17",
          current_period_end: "2026-10-17",
          trial_ends_at: "2026-10-17T00:00:00Z",
          amount_paisa: 0,
          grace_until: null,
          cancel_at: null,
          cancelled_at: null,
          plans: { code: "pro" },
        },
        error: null,
      }),
    })

    const result = await getSubscription(CTX, client)
    expect(result).toEqual({
      ok: true,
      data: {
        planCode: "pro",
        status: "trialing",
        billingInterval: "monthly",
        currentPeriodStart: "2026-09-17",
        currentPeriodEnd: "2026-10-17",
        trialEndsAt: "2026-10-17T00:00:00Z",
        priceSnapshotPaisa: 0,
        graceUntil: null,
        cancelAt: null,
        cancelledAt: null,
      },
    })
  })

  it("is not_found for a personal workspace (no subscription row, §5.9)", async () => {
    const client = fakeClient({
      subscriptions: queryResult({ data: null, error: null }),
    })
    const result = await getSubscription(CTX, client)
    expect(!result.ok && result.error.code).toBe("not_found")
  })

  it("is dependency_unavailable on a query error", async () => {
    const client = fakeClient({
      subscriptions: queryResult({ data: null, error: { message: "timeout" } }),
    })
    const result = await getSubscription(CTX, client)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("hasSubscription", () => {
  it("is true when a row is counted", async () => {
    const client = fakeClient({
      subscriptions: queryResult({ data: null, error: null, count: 1 }),
    })
    const result = await hasSubscription(CTX, client)
    expect(result).toEqual({ ok: true, data: true })
  })

  it("is false for a personal workspace", async () => {
    const client = fakeClient({
      subscriptions: queryResult({ data: null, error: null, count: 0 }),
    })
    const result = await hasSubscription(CTX, client)
    expect(result).toEqual({ ok: true, data: false })
  })
})
