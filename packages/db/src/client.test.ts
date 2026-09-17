import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setServiceRoleLogger, withServiceRole } from "./client"

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
}

describe("withServiceRole", () => {
  const logged: { reason: string; outcome: string }[] = []

  beforeEach(() => {
    logged.length = 0
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
    setServiceRoleLogger((entry) =>
      logged.push({ reason: entry.reason, outcome: entry.outcome })
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("hands the operation a client and returns its result", async () => {
    const result = await withServiceRole(
      "test: read inbound events",
      async (db) => {
        expect(db).toBeDefined()
        return "done"
      }
    )
    expect(result).toBe("done")
  })

  // The reason is the written-down review that ARCHITECTURE §3 requires. An empty
  // one is not a formality to skip.
  it("refuses to run without a reason", async () => {
    await expect(withServiceRole("", async () => "never")).rejects.toThrow(
      /reason/
    )
    await expect(withServiceRole("   ", async () => "never")).rejects.toThrow(
      /reason/
    )
  })

  it("logs every successful bypass with its reason", async () => {
    await withServiceRole("test: grant entitlement", async () => "ok")
    expect(logged).toEqual([
      { reason: "test: grant entitlement", outcome: "ok" },
    ])
  })

  // A failed bypass is the one you most want in the log.
  it("logs a failure and rethrows", async () => {
    await expect(
      withServiceRole("test: failing operation", async () => {
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")

    expect(logged).toEqual([
      { reason: "test: failing operation", outcome: "error" },
    ])
  })

  it("refuses to build a client when the service-role key is absent", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    await expect(
      withServiceRole("test: no key", async () => "ok")
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(logged).toEqual([{ reason: "test: no key", outcome: "error" }])
  })
})
