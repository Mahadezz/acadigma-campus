import { describe, expect, it } from "vitest"

import {
  accessModeSchema,
  getUsageOutput,
  limitExceededErrorSchema,
  limitKeySchema,
  planCodeSchema,
  planLimitSchema,
  planReadOnlyErrorSchema,
  planSchema,
  runBillingTickOutput,
  setPlanLimitInput,
  setPlanModuleInput,
  subscriptionStatusSchema,
  upsertPlanInput,
  usageEntrySchema,
} from "./plans"

describe("planCodeSchema", () => {
  it("accepts every seeded plan code", () => {
    for (const code of [
      "personal_free",
      "free",
      "starter",
      "pro",
      "enterprise",
    ]) {
      expect(planCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it("rejects an upper-case or symbol-bearing code", () => {
    expect(planCodeSchema.safeParse("Pro").success).toBe(false)
    expect(planCodeSchema.safeParse("pro-plus").success).toBe(false)
  })
})

describe("limitKeySchema", () => {
  it("accepts the seeded limit keys, including the D-39 rename", () => {
    for (const key of [
      "max_teachers",
      "max_students",
      "storage_gb",
      "ai_actions_per_month",
    ]) {
      expect(limitKeySchema.safeParse(key).success).toBe(true)
    }
  })

  it("rejects the superseded per-day key spelling only if malformed — the string itself is still valid shape", () => {
    // ai_credits_per_day is shape-valid text; it is no longer SEEDED, which a
    // pgTAP test (07_plans_limits.sql) asserts against the database, not Zod.
    expect(limitKeySchema.safeParse("ai_credits_per_day").success).toBe(true)
  })
})

describe("planSchema", () => {
  it("round-trips a full plan row", () => {
    const row = {
      id: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
      code: "pro",
      name: "Pro",
      tagline: "The full operations suite",
      description: null,
      sortOrder: 30,
      isPublic: true,
      isContactSales: false,
      currency: "BDT",
      setupFeePaisa: 0,
      includedSmsPerMonth: 1000,
      trialDays: 14,
      status: "active",
      createdAt: "2026-09-17T00:00:00Z",
      updatedAt: "2026-09-17T00:00:00Z",
    }
    expect(planSchema.safeParse(row).success).toBe(true)
  })
})

describe("planLimitSchema — NULL sentinel", () => {
  it("accepts a null valueInt as unlimited", () => {
    const result = planLimitSchema.safeParse({
      planId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
      key: "max_teachers",
      valueInt: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a negative valueInt", () => {
    const result = planLimitSchema.safeParse({
      planId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
      key: "max_teachers",
      valueInt: -1,
    })
    expect(result.success).toBe(false)
  })
})

describe("usageEntrySchema / getUsageOutput", () => {
  it("accepts a record keyed by limit key", () => {
    const result = getUsageOutput.safeParse({
      max_students: { current: 340, limit: 150, overBy: 190 },
      storage_gb: { current: 1, limit: null, overBy: 0 },
    })
    expect(result.success).toBe(true)
  })

  it("a single entry requires overBy to be non-negative", () => {
    expect(
      usageEntrySchema.safeParse({ current: 1, limit: 10, overBy: -1 }).success
    ).toBe(false)
  })
})

describe("limitExceededErrorSchema", () => {
  it("matches the domain LimitExceededError shape", () => {
    const result = limitExceededErrorSchema.safeParse({
      code: "LIMIT_EXCEEDED",
      limitKey: "max_students",
      limit: 150,
      current: 340,
      planCode: "free",
      suggestedPlanCode: "starter",
    })
    expect(result.success).toBe(true)
  })

  it("planCode/suggestedPlanCode are optional", () => {
    const result = limitExceededErrorSchema.safeParse({
      code: "LIMIT_EXCEEDED",
      limitKey: "max_students",
      limit: 150,
      current: 340,
    })
    expect(result.success).toBe(true)
  })
})

describe("planReadOnlyErrorSchema", () => {
  it("accepts a null reason", () => {
    expect(
      planReadOnlyErrorSchema.safeParse({
        code: "PLAN_READ_ONLY",
        reason: null,
      }).success
    ).toBe(true)
  })
})

describe("subscriptionStatusSchema / accessModeSchema — enum parity with Postgres", () => {
  it("accepts exactly the five subscription_status labels", () => {
    for (const value of [
      "trialing",
      "active",
      "past_due",
      "cancelled",
      "expired",
    ]) {
      expect(subscriptionStatusSchema.safeParse(value).success).toBe(true)
    }
    expect(subscriptionStatusSchema.safeParse("lapsed").success).toBe(false)
  })

  it("accepts exactly the two access_mode labels", () => {
    expect(accessModeSchema.safeParse("normal").success).toBe(true)
    expect(accessModeSchema.safeParse("read_only").success).toBe(true)
    expect(accessModeSchema.safeParse("locked").success).toBe(false)
  })
})

describe("upsertPlanInput", () => {
  it("fills in the documented defaults", () => {
    const parsed = upsertPlanInput.parse({ code: "starter", name: "Starter" })
    expect(parsed).toMatchObject({
      sortOrder: 0,
      isPublic: true,
      isContactSales: false,
      currency: "BDT",
      setupFeePaisa: 0,
      includedSmsPerMonth: 0,
      trialDays: 0,
      status: "active",
    })
  })
})

describe("setPlanLimitInput / setPlanModuleInput", () => {
  it("setPlanLimitInput allows an explicit null to mean unlimited", () => {
    const result = setPlanLimitInput.safeParse({
      planId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
      key: "max_teachers",
      valueInt: null,
    })
    expect(result.success).toBe(true)
  })

  it("setPlanModuleInput requires isEnabled explicitly, no default", () => {
    const result = setPlanModuleInput.safeParse({
      planId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
      module: "fees",
    })
    expect(result.success).toBe(false)
  })
})

describe("runBillingTickOutput", () => {
  it("accepts a non-negative trial count", () => {
    expect(runBillingTickOutput.safeParse({ trialsExpired: 0 }).success).toBe(
      true
    )
    expect(runBillingTickOutput.safeParse({ trialsExpired: 3 }).success).toBe(
      true
    )
  })

  it("rejects a negative or non-integer count", () => {
    expect(runBillingTickOutput.safeParse({ trialsExpired: -1 }).success).toBe(
      false
    )
    expect(runBillingTickOutput.safeParse({ trialsExpired: 1.5 }).success).toBe(
      false
    )
  })
})
