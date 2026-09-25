import { describe, expect, it, vi } from "vitest"

import { listGradeScales, saveGradeScale, seedBdGradeScale } from "./grading"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX: WorkspaceContext = {
  workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
  userId: "aaaaaaaa-0000-4000-a000-000000000001",
  role: "owner",
  workspaceType: "school",
  plan: "pro",
}
const SCALE_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

function selectClient(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return { from: () => builder } as unknown as AcadigmaSupabaseClient
}

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as unknown as AcadigmaSupabaseClient, rpc }
}

describe("listGradeScales", () => {
  it("maps rows (numeric strings to numbers) and sorts bands", async () => {
    const client = selectClient({
      data: [
        {
          id: SCALE_ID,
          code: "BD_GPA5",
          name: "Bangladesh GPA 5.00",
          is_default: true,
          grade_bands: [
            {
              letter: "F",
              min_percent: "0.00",
              max_percent: "32.99",
              grade_point: "0.00",
              is_fail: true,
              sort_order: 7,
            },
            {
              letter: "A+",
              min_percent: "80.00",
              max_percent: "100.00",
              grade_point: "5.00",
              is_fail: false,
              sort_order: 1,
            },
          ],
        },
      ],
      error: null,
    })
    const result = await listGradeScales(CTX, client)
    expect(result.ok && result.data[0]?.bands.map((b) => b.letter)).toEqual([
      "A+",
      "F",
    ])
    expect(result.ok && result.data[0]?.bands[1]?.maxPercent).toBe(32.99)
  })

  it("returns dependency_unavailable on error", async () => {
    const result = await listGradeScales(
      CTX,
      selectClient({ data: null, error: { message: "x" } })
    )
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("seedBdGradeScale", () => {
  it("calls the RPC with the context's workspace", async () => {
    const { client, rpc } = rpcClient({ data: SCALE_ID, error: null })
    const result = await seedBdGradeScale(CTX, client)
    expect(rpc).toHaveBeenCalledWith("seed_bd_grade_scale", {
      p_workspace_id: CTX.workspaceId,
    })
    expect(result).toEqual({ ok: true, data: { scaleId: SCALE_ID } })
  })
})

describe("saveGradeScale", () => {
  const input = {
    scaleId: SCALE_ID,
    name: "X",
    bands: [
      {
        letter: "P",
        minPercent: 0,
        maxPercent: 100,
        gradePoint: 1,
        isFail: false,
        sortOrder: 1,
      },
    ],
  }

  it("sends snake_case bands", async () => {
    const { client, rpc } = rpcClient({ data: SCALE_ID, error: null })
    await saveGradeScale(CTX, client, input)
    expect(rpc).toHaveBeenCalledWith("save_grade_scale", {
      p_workspace_id: CTX.workspaceId,
      p_scale_id: SCALE_ID,
      p_name: "X",
      p_bands: [
        {
          letter: "P",
          min_percent: 0,
          max_percent: 100,
          grade_point: 1,
          is_fail: false,
          sort_order: 1,
        },
      ],
    })
  })

  it("maps BAND_GAP / BAND_OVERLAP to validation_failed and not-found to not_found", async () => {
    for (const code of ["BAND_GAP", "BAND_OVERLAP", "BAND_POINTS_DECREASE"]) {
      const { client } = rpcClient({
        data: null,
        error: { message: code, code: "23514" },
      })
      const result = await saveGradeScale(CTX, client, input)
      expect(!result.ok && result.error.fieldErrors?.["bands"]).toEqual([code])
    }
    const { client } = rpcClient({
      data: null,
      error: { message: "grade scale not found", code: "P0002" },
    })
    const result = await saveGradeScale(CTX, client, input)
    expect(!result.ok && result.error.code).toBe("not_found")
  })
})
