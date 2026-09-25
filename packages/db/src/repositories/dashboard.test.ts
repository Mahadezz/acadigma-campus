import { describe, expect, it } from "vitest"

import { getDashboardSummary } from "./dashboard"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"
const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: "aaaaaaaa-0000-0000-0000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: "pro",
}

type Result = { data?: unknown; error?: unknown; count?: number | null }
type Call = {
  table: string
  select?: unknown
  opts?: unknown
  filters: unknown[][]
}

/** Chainable, thenable query builder that records every filter it is given. */
function fakeClient(resolve: (call: Call) => Result) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => {
      const call: Call = { table, filters: [] }
      calls.push(call)
      const builder: Record<string, unknown> = {
        select: (arg: unknown, opts?: unknown) => {
          call.select = arg
          call.opts = opts
          return builder
        },
        eq: (...a: unknown[]) => (call.filters.push(["eq", ...a]), builder),
        in: (...a: unknown[]) => (call.filters.push(["in", ...a]), builder),
        maybeSingle: () => Promise.resolve(resolve(call)),
        then: (ok: (v: unknown) => void, bad: (e: unknown) => void) =>
          Promise.resolve(resolve(call)).then(ok, bad),
      }
      return builder
    },
  } as unknown as AcadigmaSupabaseClient
  return { client, calls }
}

const ROLE_COUNTS: Record<string, number> = {
  owner: 1,
  admin: 2,
  teacher: 14,
  staff: 3,
  parent: 0,
}

function happy(call: Call): Result {
  if (call.table === "workspaces")
    return {
      data: {
        name: "Acadigma Demo School",
        logo_url: null,
        trial_ends_at: "2026-10-09T18:00:00Z",
        access_mode: "full",
      },
    }
  if (call.table === "school_profiles")
    return {
      data: {
        workspace_id: WORKSPACE_ID,
        timezone: "Asia/Dhaka",
        branding: { header_line_1: "Acadigma Demo School", logo_file_id: null },
      },
    }
  if (call.table === "staff_directory") return { count: 7 }
  const role = call.filters.find((f) => f[1] === "role")?.[2] as string
  return { count: ROLE_COUNTS[role] ?? 0 }
}

describe("getDashboardSummary", () => {
  it("returns the school, branding, trial and real counts", async () => {
    const { client } = fakeClient(happy)
    const result = await getDashboardSummary(CTX, client)
    expect(result).toEqual({
      ok: true,
      data: {
        schoolName: "Acadigma Demo School",
        headerLine1: "Acadigma Demo School",
        headerLine2: null,
        hasLogo: false,
        timezone: "Asia/Dhaka",
        trialEndsAt: "2026-10-09T18:00:00Z",
        accessMode: "full",
        membersByRole: ROLE_COUNTS,
        staffRecordCount: 7,
      },
    })
  })

  it("counts with head-only queries scoped to this workspace — no rows fetched", async () => {
    const { client, calls } = fakeClient(happy)
    await getDashboardSummary(CTX, client)
    const counts = calls.filter(
      (c) => c.table !== "workspaces" && c.table !== "school_profiles"
    )
    expect(counts).toHaveLength(6)
    for (const c of counts) {
      expect(c.opts).toEqual({ count: "exact", head: true })
      expect(c.filters).toContainEqual(["eq", "workspace_id", WORKSPACE_ID])
    }
    const members = counts.filter((c) => c.table === "workspace_members")
    for (const m of members)
      expect(m.filters).toContainEqual(["eq", "status", "active"])
    const staff = counts.find((c) => c.table === "staff_directory")
    expect(staff?.filters).toContainEqual([
      "in",
      "employment_status",
      ["active", "on_notice"],
    ])
  })

  it("still renders without a school profile row (no letterhead yet)", async () => {
    const { client } = fakeClient((call) =>
      call.table === "school_profiles" ? { data: null } : happy(call)
    )
    const result = await getDashboardSummary(CTX, client)
    expect(result.ok && result.data.headerLine1).toBeNull()
    expect(result.ok && result.data.timezone).toBe("Asia/Dhaka")
  })

  it("fails closed when any count errors", async () => {
    const { client } = fakeClient((call) =>
      call.table === "staff_directory"
        ? { error: { message: "boom" } }
        : happy(call)
    )
    const result = await getDashboardSummary(CTX, client)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})
