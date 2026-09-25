import { describe, expect, it } from "vitest"

import { fetchUiPreferences, upsertUiPreferences } from "./ui-preferences"

import type { AcadigmaSupabaseClient } from "../client"

const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

type Row = { ui_mode: string; text_size: string } | null

/**
 * Narrowest stand-in for the two calls this repository makes:
 * `.select().eq().maybeSingle()` for a read, `.upsert().select().single()`
 * for a write. Mirrors `settings.test.ts`'s `fakeClient`.
 */
function fakeClient(options: {
  row?: Row
  selectError?: boolean
  upsertRow?: Row
  upsertError?: boolean
  onUpsert?: (values: Record<string, unknown>) => void
}): AcadigmaSupabaseClient {
  const { row = null, selectError = false } = options

  return {
    from: (table: string) => {
      if (table !== "user_preferences")
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
        upsert: (values: Record<string, unknown>) => {
          options.onUpsert?.(values)
          return {
            select: () => ({
              single: async () => ({
                data: options.upsertError
                  ? null
                  : (options.upsertRow ??
                    ({
                      ui_mode:
                        (values.ui_mode as string) ?? row?.ui_mode ?? "full",
                      text_size:
                        (values.text_size as string) ??
                        row?.text_size ??
                        "normal",
                    } satisfies NonNullable<Row>)),
                error: options.upsertError
                  ? { message: "constraint violation" }
                  : null,
              }),
            }),
          }
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as AcadigmaSupabaseClient
}

describe("fetchUiPreferences", () => {
  it("returns the row's values when one exists", async () => {
    const client = fakeClient({ row: { ui_mode: "basic", text_size: "large" } })
    const result = await fetchUiPreferences(client, USER_ID)
    expect(result.ok && result.data).toEqual({
      uiMode: "basic",
      textSize: "large",
    })
  })

  it("returns the documented defaults when there is no row (§3 'no row needed to read')", async () => {
    const client = fakeClient({ row: null })
    const result = await fetchUiPreferences(client, USER_ID)
    expect(result.ok && result.data).toEqual({
      uiMode: "full",
      textSize: "normal",
    })
  })

  it("returns dependency_unavailable on a query error", async () => {
    const client = fakeClient({ selectError: true })
    const result = await fetchUiPreferences(client, USER_ID)
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("upsertUiPreferences", () => {
  it("upserts only the supplied keys (partial patch)", async () => {
    let seen: Record<string, unknown> | undefined
    const client = fakeClient({
      row: { ui_mode: "full", text_size: "normal" },
      onUpsert: (values) => {
        seen = values
      },
    })
    await upsertUiPreferences(client, USER_ID, { uiMode: "basic" })
    expect(seen).toEqual({ user_id: USER_ID, ui_mode: "basic" })
  })

  it("returns the freshly written pair", async () => {
    const client = fakeClient({
      upsertRow: { ui_mode: "basic", text_size: "xlarge" },
    })
    const result = await upsertUiPreferences(client, USER_ID, {
      uiMode: "basic",
      textSize: "xlarge",
    })
    expect(result.ok && result.data).toEqual({
      uiMode: "basic",
      textSize: "xlarge",
    })
  })

  it("returns dependency_unavailable on a write error", async () => {
    const client = fakeClient({ upsertError: true })
    const result = await upsertUiPreferences(client, USER_ID, {
      uiMode: "basic",
    })
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})
