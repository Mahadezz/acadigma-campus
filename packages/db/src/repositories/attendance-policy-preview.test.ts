import { describe, expect, it, vi } from "vitest"

import type { AttendanceStatus } from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const mockGetAttendanceRegister = vi.fn()
vi.mock("./attendance-register", () => ({
  getAttendanceRegister: mockGetAttendanceRegister,
}))

const { getAttendancePolicySample } =
  await import("./attendance-policy-preview")

const CTX: WorkspaceContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  role: "admin",
  workspaceType: "school",
  plan: "pro",
}

function fakeClient(options: {
  session?: { section_id: string; date: string } | null
  sessionError?: boolean
}): AcadigmaSupabaseClient {
  const { session = null, sessionError = false } = options
  return {
    from: (table: string) => {
      if (table !== "attendance_sessions")
        throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: sessionError ? null : session,
                    error: sessionError
                      ? { message: "connection reset" }
                      : null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

const cells = (statuses: (AttendanceStatus | null)[]) => statuses

describe("getAttendancePolicySample", () => {
  it("no session ever taken: the empty, no-data-yet sample", async () => {
    const client = fakeClient({ session: null })
    const result = await getAttendancePolicySample(client, CTX)
    expect(result).toEqual({
      ok: true,
      data: { studentName: null, month: null, statuses: [] },
    })
    expect(mockGetAttendanceRegister).not.toHaveBeenCalled()
  })

  it("a connection error surfaces as dependency_unavailable", async () => {
    const client = fakeClient({ sessionError: true })
    const result = await getAttendancePolicySample(client, CTX)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })

  it("picks the student with the most recorded days from the latest month", async () => {
    const client = fakeClient({
      session: { section_id: "sec-1", date: "2026-09-15" },
    })
    mockGetAttendanceRegister.mockResolvedValueOnce({
      ok: true,
      data: {
        students: [
          {
            studentNameEn: "Rina",
            recordedDays: 2,
            cells: cells(["present", "absent"]),
          },
          {
            studentNameEn: "Ayesha",
            recordedDays: 3,
            cells: cells(["present", "late", null]),
          },
        ],
      },
    })

    const result = await getAttendancePolicySample(client, CTX)
    expect(mockGetAttendanceRegister).toHaveBeenCalledWith(
      client,
      CTX,
      "sec-1",
      "2026-09"
    )
    expect(result).toEqual({
      ok: true,
      data: {
        studentName: "Ayesha",
        month: "2026-09",
        statuses: ["present", "late"],
      },
    })
  })

  it("a session exists but nobody has a recorded day yet: the empty sample", async () => {
    const client = fakeClient({
      session: { section_id: "sec-1", date: "2026-09-15" },
    })
    mockGetAttendanceRegister.mockResolvedValueOnce({
      ok: true,
      data: {
        students: [{ studentNameEn: "Rina", recordedDays: 0, cells: [] }],
      },
    })
    const result = await getAttendancePolicySample(client, CTX)
    expect(result).toEqual({
      ok: true,
      data: { studentName: null, month: null, statuses: [] },
    })
  })

  it("the register RPC fails: the empty sample, not an error (this is a preview, not the register page)", async () => {
    const client = fakeClient({
      session: { section_id: "sec-1", date: "2026-09-15" },
    })
    mockGetAttendanceRegister.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_found", message: "gone" },
    })
    const result = await getAttendancePolicySample(client, CTX)
    expect(result).toEqual({
      ok: true,
      data: { studentName: null, month: null, statuses: [] },
    })
  })
})
