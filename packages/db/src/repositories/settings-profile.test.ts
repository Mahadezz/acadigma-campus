import { describe, expect, it } from "vitest"

import { getSchoolProfile, updateSchoolProfile } from "./settings"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX: WorkspaceContext = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
  role: "admin",
  workspaceType: "school",
  plan: "pro",
}

const V1 = "2026-09-25T10:00:00.1+00:00"
const V2 = "2026-09-25T10:05:00.2+00:00"

const ROW = {
  legal_name: "Lakeview School",
  eiin: "123456",
  board: "BD National",
  city: "Dhaka",
  branding: { accent: "#1F4E79" },
  updated_at: V1,
}

type Call = { patch: Record<string, unknown>; filters: [string, unknown][] }

/**
 * A tiny in-memory `school_profiles`: the UPDATE only matches while every
 * `.eq()` filter holds, which is exactly the optimistic-concurrency contract.
 */
function fakeClient(opts: {
  row: Record<string, unknown> | null
  updateError?: { code?: string; message: string }
  calls?: Call[]
}): AcadigmaSupabaseClient {
  let row = opts.row
  const matches = (filters: [string, unknown][]) =>
    row !== null &&
    filters.every(([col, val]) =>
      col === "workspace_id" ? val === CTX.workspaceId : row?.[col] === val
    )
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        const filters: [string, unknown][] = []
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val])
            return chain
          },
          select: () => ({
            maybeSingle: async () => {
              opts.calls?.push({ patch, filters })
              if (opts.updateError) {
                return { data: null, error: opts.updateError }
              }
              if (!matches(filters)) return { data: null, error: null }
              row = { ...row, ...patch, updated_at: V2 }
              return { data: row, error: null }
            },
          }),
        }
        return chain
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

describe("getSchoolProfile", () => {
  it("returns the typed fields, resolved branding and the version", async () => {
    const result = await getSchoolProfile(fakeClient({ row: ROW }), CTX)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.version).toBe(V1)
    expect(result.data.fields.legal_name).toBe("Lakeview School")
    expect(result.data.fields.motto).toBeNull()
    expect(result.data.branding).toEqual({
      logo_file_id: null,
      header_line_1: null,
      header_line_2: null,
      accent: "#1F4E79",
      report_footer: null,
    })
  })

  it("returns not_found without a row", async () => {
    const result = await getSchoolProfile(fakeClient({ row: null }), CTX)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})

describe("updateSchoolProfile — optimistic concurrency", () => {
  it("saves when the version matches and returns the new version", async () => {
    const calls: Call[] = []
    const result = await updateSchoolProfile(
      fakeClient({ row: ROW, calls }),
      CTX,
      { version: V1, profile: { legal_name: "Lakeview High School" } }
    )
    expect(result.ok && result.data.fields.legal_name).toBe(
      "Lakeview High School"
    )
    expect(result.ok && result.data.version).toBe(V2)
    expect(calls[0]?.filters).toContainEqual(["updated_at", V1])
  })

  it("returns conflict and writes nothing when the version is stale (AC5)", async () => {
    const client = fakeClient({ row: ROW })
    const first = await updateSchoolProfile(client, CTX, {
      version: V1,
      profile: { city: "Sylhet" },
    })
    expect(first.ok).toBe(true)
    const second = await updateSchoolProfile(client, CTX, {
      version: V1,
      profile: { city: "Khulna" },
    })
    expect(!second.ok && second.error.code).toBe("conflict")
    const now = await getSchoolProfile(client, CTX)
    expect(now.ok && now.data.fields.city).toBe("Sylhet")
  })

  it("merges branding onto the stored blob, keeping keys it did not touch", async () => {
    const calls: Call[] = []
    await updateSchoolProfile(fakeClient({ row: ROW, calls }), CTX, {
      version: V1,
      branding: { header_line_1: "{city}" },
    })
    expect(calls[0]?.patch["branding"]).toEqual({
      accent: "#1F4E79",
      header_line_1: "{city}",
    })
  })

  it("maps a duplicate EIIN to a conflict on the eiin field", async () => {
    const result = await updateSchoolProfile(
      fakeClient({ row: ROW, updateError: { code: "23505", message: "dup" } }),
      CTX,
      { version: V1, profile: { eiin: "654321" } }
    )
    expect(!result.ok && result.error.fieldErrors?.["eiin"]).toBeTruthy()
  })

  it("does not write an empty patch", async () => {
    const calls: Call[] = []
    const result = await updateSchoolProfile(
      fakeClient({ row: ROW, calls }),
      CTX,
      { version: V1, profile: {} }
    )
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(0)
  })
})
