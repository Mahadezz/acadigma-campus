import { describe, expect, it } from "vitest"

import { acceptLegalDocument, listLegalAcceptances } from "./legal"

import type { AcadigmaSupabaseClient } from "../client"

const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"
const WS_ID = "1c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

function selectClient(
  rows: { document: string; version: string; workspace_id: string | null }[],
  error = false,
  seen: string[] = []
): AcadigmaSupabaseClient {
  return {
    from: (table: string) => {
      seen.push(table)
      return {
        select: (cols: string) => {
          seen.push(cols)
          return {
            or: async (filter: string) => {
              seen.push(filter)
              return {
                data: error ? null : rows,
                error: error ? { message: "down" } : null,
              }
            },
          }
        },
      }
    },
  } as unknown as AcadigmaSupabaseClient
}

function rpcClient(
  error: { message: string } | null,
  calls: unknown[] = []
): AcadigmaSupabaseClient {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push([fn, args])
      return { data: null, error }
    },
  } as unknown as AcadigmaSupabaseClient
}

describe("listLegalAcceptances", () => {
  it("reads the caller's personal rows only, with explicit columns", async () => {
    const seen: string[] = []
    const result = await listLegalAcceptances(
      selectClient(
        [{ document: "terms", version: "v1", workspace_id: null }],
        false,
        seen
      ),
      USER_ID,
      null
    )
    expect(result).toEqual({
      ok: true,
      data: [{ document: "terms", version: "v1", workspaceId: null }],
    })
    expect(seen).toEqual([
      "legal_acceptances",
      "document, version, workspace_id",
      `and(user_id.eq.${USER_ID},workspace_id.is.null)`,
    ])
  })

  it("adds the school's DPA rows for its owner", async () => {
    const seen: string[] = []
    await listLegalAcceptances(selectClient([], false, seen), USER_ID, WS_ID)
    expect(seen[2]).toBe(
      `and(user_id.eq.${USER_ID},workspace_id.is.null),and(workspace_id.eq.${WS_ID},document.eq.dpa)`
    )
  })

  it("maps a read error to dependency_unavailable", async () => {
    const result = await listLegalAcceptances(
      selectClient([], true),
      USER_ID,
      null
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("dependency_unavailable")
  })
})

describe("acceptLegalDocument", () => {
  it("sends no workspace for Terms", async () => {
    const calls: unknown[] = []
    const result = await acceptLegalDocument(
      rpcClient(null, calls),
      "terms",
      "v1",
      null
    )
    expect(result).toEqual({ ok: true, data: null })
    expect(calls).toEqual([
      ["accept_legal_document", { p_document: "terms", p_version: "v1" }],
    ])
  })

  it("sends the school for the DPA", async () => {
    const calls: unknown[] = []
    await acceptLegalDocument(rpcClient(null, calls), "dpa", "v1", WS_ID)
    expect(calls).toEqual([
      [
        "accept_legal_document",
        { p_document: "dpa", p_version: "v1", p_workspace_id: WS_ID },
      ],
    ])
  })

  it.each([
    ["FORBIDDEN", "forbidden"],
    ["LEGAL_DOCUMENT_UNKNOWN", "conflict"],
    ["boom", "dependency_unavailable"],
  ])("maps %s to %s", async (message, code) => {
    const result = await acceptLegalDocument(
      rpcClient({ message }),
      "dpa",
      "v1",
      WS_ID
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })
})
