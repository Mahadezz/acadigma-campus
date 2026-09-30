import { describe, expect, it } from "vitest"

import {
  getStaffCheckInToday,
  staffCheckIn,
  staffCheckOut,
} from "./staff-attendance"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX: WorkspaceContext = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
  role: "teacher",
  workspaceType: "school",
  plan: "pro",
}

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  date: "2026-10-01",
  status: "late",
  check_in_at: "2026-10-01T02:30:00Z",
  check_out_at: null,
  minutes_late: 30,
}

function fakeClient(result: {
  data: unknown
  error: { code?: string; message: string; details?: string } | null
}) {
  const calls: { fn: string; args: unknown }[] = []
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args })
      return result
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
  return { client, calls }
}

describe("staffCheckIn / staffCheckOut", () => {
  it("send the workspace id and nothing else, and map the row", async () => {
    const { client, calls } = fakeClient({ data: ROW, error: null })
    const result = await staffCheckIn(CTX, client)
    expect(calls).toEqual([
      {
        fn: "staff_check_in",
        args: { p_workspace_id: CTX.workspaceId },
      },
    ])
    expect(result.ok && result.data).toEqual({
      id: ROW.id,
      date: "2026-10-01",
      status: "late",
      checkInAt: ROW.check_in_at,
      checkOutAt: null,
      minutesLate: 30,
    })
    const out = await staffCheckOut(CTX, client)
    expect(out.ok).toBe(true)
    expect(calls[1]?.fn).toBe("staff_check_out")
  })

  it.each([
    ["42501", "FORBIDDEN", "forbidden"],
    ["22023", "NOT_SCHOOL_DAY", "conflict"],
    ["22023", "NOT_CHECKED_IN", "conflict"],
    ["XX000", "boom", "dependency_unavailable"],
  ])("maps %s %s to %s", async (code, message, expected) => {
    const { client } = fakeClient({ data: null, error: { code, message } })
    const result = await staffCheckIn(CTX, client)
    expect(!result.ok && result.error.code).toBe(expected)
  })

  it("maps the read-only trigger to payment_required, not forbidden", async () => {
    const { client } = fakeClient({
      data: null,
      error: {
        code: "42501",
        message: "PLAN_READ_ONLY",
        details: "Your Pro trial has ended.",
      },
    })
    const result = await staffCheckIn(CTX, client)
    expect(!result.ok && result.error.code).toBe("payment_required")
  })

  it("returns unavailable, not a throw, on a malformed row", async () => {
    const { client } = fakeClient({ data: { id: 1 }, error: null })
    const result = await staffCheckIn(CTX, client)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("getStaffCheckInToday", () => {
  it("maps a school day with no record", async () => {
    const { client } = fakeClient({
      data: {
        today: "2026-10-01",
        timezone: "Asia/Dhaka",
        is_school_day: true,
        record: null,
      },
      error: null,
    })
    const result = await getStaffCheckInToday(CTX, client)
    expect(result.ok && result.data).toEqual({
      today: "2026-10-01",
      timezone: "Asia/Dhaka",
      isSchoolDay: true,
      record: null,
    })
  })

  it("maps a record", async () => {
    const { client } = fakeClient({
      data: {
        today: "2026-10-01",
        timezone: "Asia/Dhaka",
        is_school_day: false,
        record: ROW,
      },
      error: null,
    })
    const result = await getStaffCheckInToday(CTX, client)
    expect(result.ok && result.data.record?.minutesLate).toBe(30)
  })

  it("maps a refusal", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "42501", message: "FORBIDDEN" },
    })
    const result = await getStaffCheckInToday(CTX, client)
    expect(!result.ok && result.error.code).toBe("forbidden")
  })
})
