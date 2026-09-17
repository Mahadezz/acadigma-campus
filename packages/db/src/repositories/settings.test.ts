import { describe, expect, it } from "vitest"

import { getSchoolSettings, updateSchoolSettings } from "./settings"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"

const CTX: WorkspaceContext = {
  workspaceId: WORKSPACE_ID,
  userId: "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d",
  role: "admin",
  plan: "pro",
}

type Row = Record<string, unknown> | null

/**
 * The narrowest stand-in for the supabase-js query builder that this repository's
 * two calls need: `.select().eq().maybeSingle()` for a read and
 * `.update().eq().select().maybeSingle()` for a write. Mirrors the style already
 * used in `workspace-context.test.ts`.
 */
function fakeClient(options: {
  row?: Row
  selectError?: boolean
  updateRow?: Row
  updateError?: boolean
  onUpdate?: (patch: Record<string, unknown>) => void
}): AcadigmaSupabaseClient {
  const { row = null, selectError = false } = options

  return {
    from: (table: string) => {
      if (table !== "school_profiles")
        throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: selectError ? null : row,
              error: selectError ? { message: "connection reset" } : null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          options.onUpdate?.(patch)
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: options.updateError
                    ? null
                    : (options.updateRow ?? { ...row, ...patch }),
                  error: options.updateError
                    ? { message: "constraint violation" }
                    : null,
                }),
              }),
            }),
          }
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

describe("getSchoolSettings", () => {
  it("resolves the stored row against the shipped defaults", async () => {
    const client = fakeClient({
      row: {
        workspace_id: WORKSPACE_ID,
        timezone: "Asia/Dhaka",
        working_days: [6, 7, 1, 2, 3, 4],
        attendance_policy: { min_attendance_bp: 8000 },
        academic_settings: {},
        cover_policy: {},
        messaging_policy: {},
        branding: {},
      },
    })
    const result = await getSchoolSettings(client, CTX)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.attendancePolicy.min_attendance_bp).toBe(8000)
      expect(result.data.attendancePolicy.mode).toBe("daily") // default filled in
      expect(result.data.workspaceId).toBe(WORKSPACE_ID)
    }
  })

  it("returns not_found when the workspace has no school profile row", async () => {
    const client = fakeClient({ row: null })
    const result = await getSchoolSettings(client, CTX)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })

  it("returns dependency_unavailable on a query error", async () => {
    const client = fakeClient({ row: null, selectError: true })
    const result = await getSchoolSettings(client, CTX)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("updateSchoolSettings", () => {
  const baseRow = {
    workspace_id: WORKSPACE_ID,
    timezone: "Asia/Dhaka",
    working_days: [6, 7, 1, 2, 3, 4],
    attendance_policy: { min_attendance_bp: 7500, mode: "daily" },
    academic_settings: { pass_mark_percent: 33 },
    cover_policy: {},
    messaging_policy: {},
    branding: {},
  }

  it("merges the patch onto the stored blob, not the resolved one", async () => {
    let sentPatch: Record<string, unknown> | undefined
    const client = fakeClient({
      row: baseRow,
      onUpdate: (patch) => {
        sentPatch = patch
      },
    })

    const result = await updateSchoolSettings(client, CTX, {
      attendance_policy: { late_counts_present: false },
    })

    expect(result.ok).toBe(true)
    // The stored override for min_attendance_bp/mode must survive the merge...
    expect(sentPatch?.attendance_policy).toEqual({
      min_attendance_bp: 7500,
      mode: "daily",
      late_counts_present: false,
    })
    // ...and only attendance_policy was sent to the database.
    expect(Object.keys(sentPatch ?? {})).toEqual(["attendance_policy"])
  })

  it("touches only the blobs present in the patch", async () => {
    let sentPatch: Record<string, unknown> | undefined
    const client = fakeClient({
      row: baseRow,
      onUpdate: (patch) => {
        sentPatch = patch
      },
    })

    await updateSchoolSettings(client, CTX, {
      timezone: "Asia/Kolkata",
      cover_policy: { unpaid_absence: true },
    })

    expect(Object.keys(sentPatch ?? {}).sort()).toEqual([
      "cover_policy",
      "timezone",
    ])
  })

  it("returns the current resolved settings without writing when the patch is empty", async () => {
    let updateCalled = false
    const client = fakeClient({
      row: baseRow,
      onUpdate: () => {
        updateCalled = true
      },
    })

    const result = await updateSchoolSettings(client, CTX, {})
    expect(result.ok).toBe(true)
    expect(updateCalled).toBe(false)
  })

  it("returns not_found when the workspace has no school profile row to patch", async () => {
    const client = fakeClient({ row: null })
    const result = await updateSchoolSettings(client, CTX, {
      timezone: "Asia/Kolkata",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })

  it("returns dependency_unavailable when the update itself fails", async () => {
    const client = fakeClient({ row: baseRow, updateError: true })
    const result = await updateSchoolSettings(client, CTX, {
      timezone: "Asia/Kolkata",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })

  it("returns the freshly resolved settings from the updated row", async () => {
    const client = fakeClient({
      row: baseRow,
      updateRow: { ...baseRow, timezone: "Asia/Kolkata" },
    })
    const result = await updateSchoolSettings(client, CTX, {
      timezone: "Asia/Kolkata",
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.timezone).toBe("Asia/Kolkata")
  })
})
