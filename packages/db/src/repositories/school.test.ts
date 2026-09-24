import { describe, expect, it, vi } from "vitest"

import { checkEiinAvailability, createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"

function fakeClient(rpcResult: {
  data?: unknown
  error?: unknown
}): AcadigmaSupabaseClient {
  return {
    rpc: vi.fn(async () => rpcResult),
  } as unknown as AcadigmaSupabaseClient
}

describe("checkEiinAvailability", () => {
  it("calls public.check_eiin_available and reports availability", async () => {
    const client = fakeClient({ data: true, error: null })

    const result = await checkEiinAvailability(client, "123456")

    expect(client.rpc).toHaveBeenCalledWith("check_eiin_available", {
      eiin: "123456",
    })
    expect(result).toEqual({ ok: true, data: { available: true } })
  })

  it("reports an EIIN already taken", async () => {
    const client = fakeClient({ data: false, error: null })

    const result = await checkEiinAvailability(client, "123456")

    expect(result).toEqual({ ok: true, data: { available: false } })
  })

  it("maps an RPC error to dependency_unavailable", async () => {
    const client = fakeClient({
      data: null,
      error: { message: "permission denied for function check_eiin_available" },
    })

    const result = await checkEiinAvailability(client, "123456")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("dependency_unavailable")
    }
  })
})

describe("createSchoolWorkspace", () => {
  const input = {
    name: "Ideal School & College",
    board: "dhaka" as const,
    medium: "bangla" as const,
    timezone: "Asia/Dhaka",
    working_days: [6, 7, 1, 2, 3, 4],
    academic_year: { name: "2026", starts_on: "2026-01-01", ends_on: "2026-12-31" },
    grade_levels: [
      { name: "Class 6", name_bn: "ষষ্ঠ শ্রেণি", level_number: 6, stage: "secondary" as const },
    ],
    idempotency_key: "0b6f4a8e-3c1d-4e2a-9f7b-5d8c6e4a2b10",
  }
  const workspaceId = "5f0c2a1e-8b7d-4c3a-9e6f-1a2b3c4d5e6f"

  it("sends the whole input as p_input and returns the new workspace", async () => {
    const client = fakeClient({
      data: { workspace_id: workspaceId, name: input.name, replayed: false },
      error: null,
    })

    const result = await createSchoolWorkspace(client, input)

    expect(client.rpc).toHaveBeenCalledWith("create_school_workspace", {
      p_input: input,
    })
    expect(result).toEqual({ ok: true, data: { workspaceId, replayed: false } })
  })

  it.each([
    ["EIIN_TAKEN", "conflict"],
    ["RATE_LIMITED", "rate_limited"],
    ["WORKSPACE_LIMIT_REACHED", "forbidden"],
    ["INVALID_TIMEZONE", "validation_failed"],
    ["INVALID_ACADEMIC_YEAR", "validation_failed"],
    ["VALIDATION", "validation_failed"],
    ["IDEMPOTENCY_KEY_REUSED", "conflict"],
    ["something unexpected", "dependency_unavailable"],
  ])("maps %s to %s", async (message, code) => {
    const result = await createSchoolWorkspace(
      fakeClient({ data: null, error: { message } }),
      input
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })

  it("flags the eiin field on EIIN_TAKEN so step 1 can show it inline", async () => {
    const result = await createSchoolWorkspace(
      fakeClient({ data: null, error: { message: "EIIN_TAKEN" } }),
      input
    )
    if (!result.ok) expect(result.error.fieldErrors).toHaveProperty("eiin")
  })

  it("treats an unexpected RPC shape as internal", async () => {
    const result = await createSchoolWorkspace(
      fakeClient({ data: { nope: true }, error: null }),
      input
    )
    if (!result.ok) expect(result.error.code).toBe("internal")
    expect(result.ok).toBe(false)
  })
})
