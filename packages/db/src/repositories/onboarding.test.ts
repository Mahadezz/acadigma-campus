import { describe, expect, it } from "vitest"

import {
  getOnboardingProgress,
  markOnboardingComplete,
  saveOnboardingDraft,
} from "./onboarding"

import type { AcadigmaSupabaseClient } from "../client"

const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

type Row = Record<string, unknown> | null

/**
 * The narrowest stand-in for the supabase-js query builder this repository
 * needs: `.select().eq().maybeSingle()` for the read,
 * `.upsert().select().single()` for `saveOnboardingDraft`, and
 * `.update().eq()` + `.upsert()` for `markOnboardingComplete`. Mirrors the
 * style already used in `settings.test.ts`.
 */
function fakeClient(options: {
  row?: Row
  selectError?: boolean
  upsertRow?: Row
  upsertError?: boolean
  updateError?: boolean
  onUpsert?: (payload: Record<string, unknown>) => void
  onProfileUpdate?: (payload: Record<string, unknown>) => void
}): AcadigmaSupabaseClient {
  const { row = null, selectError = false } = options

  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          update: (payload: Record<string, unknown>) => {
            options.onProfileUpdate?.(payload)
            return {
              eq: async () => ({
                data: null,
                error: options.updateError
                  ? { message: "constraint violation" }
                  : null,
              }),
            }
          },
        }
      }
      if (table !== "onboarding_progress")
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
        upsert: (payload: Record<string, unknown>) => {
          options.onUpsert?.(payload)
          const result = {
            data: options.upsertError
              ? null
              : (options.upsertRow ?? {
                  ...row,
                  ...payload,
                  updated_at: "2026-09-25T12:00:00Z",
                }),
            error: options.upsertError
              ? { message: "constraint violation" }
              : null,
          }
          // `saveOnboardingDraft` chains `.select().single()`;
          // `markOnboardingComplete` awaits the upsert call directly. Making
          // the returned object itself thenable — resolving to the same
          // `result` — supports both call shapes with one fake.
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (value: typeof result) => void) => resolve(result),
          }
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

describe("getOnboardingProgress", () => {
  it("returns the fresh default state when no row exists yet (§4.7)", async () => {
    const client = fakeClient({ row: null })
    const result = await getOnboardingProgress(client, USER_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({
        path: "undecided",
        step: 1,
        draft: {},
        completedAt: null,
      })
    }
  })

  it("returns the stored row, coercing a null draft to an empty object", async () => {
    const client = fakeClient({
      row: {
        path: "create_school",
        step: 3,
        draft: null,
        completed_at: null,
      },
    })
    const result = await getOnboardingProgress(client, USER_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({
        path: "create_school",
        step: 3,
        draft: {},
        completedAt: null,
      })
    }
  })

  it("returns the stored draft content as-is", async () => {
    const client = fakeClient({
      row: {
        path: "create_school",
        step: 3,
        draft: { name: "Ideal School" },
        completed_at: null,
      },
    })
    const result = await getOnboardingProgress(client, USER_ID)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.draft).toEqual({ name: "Ideal School" })
  })

  it("returns dependency_unavailable on a query error", async () => {
    const client = fakeClient({ row: null, selectError: true })
    const result = await getOnboardingProgress(client, USER_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("saveOnboardingDraft", () => {
  it("upserts on user_id and does not send started_at (so a resumed draft's original start time never moves)", async () => {
    let sentPayload: Record<string, unknown> | undefined
    const client = fakeClient({
      onUpsert: (payload) => {
        sentPayload = payload
      },
    })

    const result = await saveOnboardingDraft(client, USER_ID, {
      path: "create_school",
      step: 2,
      draft: { name: "Ideal School" },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.savedAt).toBe("2026-09-25T12:00:00Z")
    expect(sentPayload).toEqual({
      user_id: USER_ID,
      path: "create_school",
      step: 2,
      draft: { name: "Ideal School" },
    })
    expect(sentPayload).not.toHaveProperty("started_at")
  })

  it("returns dependency_unavailable when the upsert fails", async () => {
    const client = fakeClient({ upsertError: true })
    const result = await saveOnboardingDraft(client, USER_ID, {
      path: "join_school",
      step: 1,
      draft: {},
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("markOnboardingComplete", () => {
  it("sets profiles.onboarding_completed_at and clears the draft (§4.7)", async () => {
    let profilePatch: Record<string, unknown> | undefined
    let progressPatch: Record<string, unknown> | undefined
    const client = fakeClient({
      onProfileUpdate: (payload) => {
        profilePatch = payload
      },
      onUpsert: (payload) => {
        progressPatch = payload
      },
    })

    const result = await markOnboardingComplete(client, USER_ID)

    expect(result.ok).toBe(true)
    expect(profilePatch).toHaveProperty("onboarding_completed_at")
    expect(progressPatch).toMatchObject({ user_id: USER_ID, draft: null })
    expect(progressPatch).toHaveProperty("completed_at")
  })

  it("returns dependency_unavailable when the profile update fails, without touching onboarding_progress", async () => {
    let progressTouched = false
    const client = fakeClient({
      updateError: true,
      onUpsert: () => {
        progressTouched = true
      },
    })

    const result = await markOnboardingComplete(client, USER_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
    expect(progressTouched).toBe(false)
  })

  it("returns dependency_unavailable when the progress upsert fails", async () => {
    const client = fakeClient({ upsertError: true })
    const result = await markOnboardingComplete(client, USER_ID)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})
