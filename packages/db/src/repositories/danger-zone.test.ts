import { describe, expect, it } from "vitest"

import {
  archiveWorkspace,
  cancelWorkspaceDeletion,
  exportWorkspaceData,
  getDangerZoneState,
  purgeDueWorkspaces,
  scheduleWorkspaceDeletion,
  unarchiveWorkspace,
} from "./danger-zone"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const CTX = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "owner",
} as unknown as WorkspaceContext

type Reply = { data: unknown; error: unknown }

/** rpc replies by function name; `from()` resolves to `fromReply`. */
function fakeClient(
  rpc: Record<string, Reply | ((args: unknown) => Reply)>,
  fromReply: Reply = { data: null, error: null }
) {
  const calls: [string, unknown][] = []
  const chain: unknown = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "then")
          return (resolve: (r: Reply) => void) => resolve(fromReply)
        return () => chain
      },
    }
  )
  const client = {
    from: () => chain,
    async rpc(name: string, args: unknown) {
      calls.push([name, args])
      const r = rpc[name]
      if (!r) return { data: null, error: { message: "unexpected" } }
      return typeof r === "function" ? r(args) : r
    },
  }
  return { client: client as unknown as AcadigmaSupabaseClient, calls }
}

const refuse = (message: string, details?: string): Reply => ({
  data: null,
  error: { message, details },
})

describe("danger zone repository (D-211)", () => {
  it("archives with the context's workspace and the typed name", async () => {
    const { client, calls } = fakeClient({
      archive_workspace: { data: null, error: null },
    })
    expect(await archiveWorkspace(CTX, client, "Ideal School")).toEqual({
      ok: true,
      data: undefined,
    })
    expect(calls[0]).toEqual([
      "archive_workspace",
      { p_workspace_id: CTX.workspaceId, p_confirm_name: "Ideal School" },
    ])
  })

  it.each([
    ["FORBIDDEN", "forbidden", undefined],
    ["NAME_MISMATCH", "validation_failed", "NAME_MISMATCH"],
    ["ALREADY_ARCHIVED", "conflict", "ALREADY_ARCHIVED"],
    ["ARCHIVE_EXPIRED", "conflict", "ARCHIVE_EXPIRED"],
    ["something else", "dependency_unavailable", undefined],
  ])("maps %s to %s", async (message, code, marker) => {
    const { client } = fakeClient({ unarchive_workspace: refuse(message) })
    const r = await unarchiveWorkspace(CTX, client, "x")
    expect(!r.ok && r.error.code).toBe(code)
    expect(!r.ok && r.error.fieldErrors?.["_root"]?.[0]).toBe(
      marker ?? undefined
    )
  })

  it("names the subscription when a paid plan blocks deletion", async () => {
    const { client } = fakeClient({
      schedule_workspace_deletion: refuse(
        "ACTIVE_SUBSCRIPTION",
        "The Pro subscription is active."
      ),
    })
    const r = await scheduleWorkspaceDeletion(CTX, client, "x")
    expect(!r.ok && r.error.message).toBe(
      "The Pro subscription is active. Cancel it first."
    )
    expect(!r.ok && r.error.fieldErrors?.["_root"]).toEqual([
      "ACTIVE_SUBSCRIPTION",
    ])
  })

  it("returns the scheduled deletion date", async () => {
    const { client } = fakeClient({
      schedule_workspace_deletion: {
        data: "2026-10-29T10:00:00+00:00",
        error: null,
      },
    })
    expect(await scheduleWorkspaceDeletion(CTX, client, "x")).toEqual({
      ok: true,
      data: { deletionScheduledAt: "2026-10-29T10:00:00+00:00" },
    })
  })

  it("cancels without a typed name and maps DELETION_DUE", async () => {
    const { client, calls } = fakeClient({
      cancel_workspace_deletion: refuse("DELETION_DUE"),
    })
    const r = await cancelWorkspaceDeletion(CTX, client)
    expect(!r.ok && r.error.fieldErrors?.["_root"]).toEqual(["DELETION_DUE"])
    expect(calls[0]).toEqual([
      "cancel_workspace_deletion",
      { p_workspace_id: CTX.workspaceId },
    ])
  })

  it("reads the lifecycle state", async () => {
    const { client } = fakeClient(
      {},
      {
        data: {
          name: "Ideal School",
          status: "active",
          archived_at: null,
          deletion_scheduled_at: "2026-10-29T10:00:00+00:00",
        },
        error: null,
      }
    )
    expect(await getDangerZoneState(CTX, client)).toEqual({
      ok: true,
      data: {
        name: "Ideal School",
        status: "active",
        archivedAt: null,
        deletionScheduledAt: "2026-10-29T10:00:00+00:00",
      },
    })
  })

  it("exports every table after logging the export", async () => {
    const { client, calls } = fakeClient({
      log_workspace_export: { data: null, error: null },
      workspace_export_tables: {
        data: ["students", "workspaces"],
        error: null,
      },
      export_workspace_table: (args) => ({
        data:
          (args as { p_table: string }).p_table === "students"
            ? [{ id: "s1" }]
            : [],
        error: null,
      }),
    })
    expect(await exportWorkspaceData(CTX, client)).toEqual({
      ok: true,
      data: [
        { table: "students", rows: [{ id: "s1" }] },
        { table: "workspaces", rows: [] },
      ],
    })
    expect(calls.map(([name]) => name)).toEqual([
      "log_workspace_export",
      "workspace_export_tables",
      "export_workspace_table",
      "export_workspace_table",
    ])
  })

  it("reads no table when the export is refused", async () => {
    const { client, calls } = fakeClient({
      log_workspace_export: refuse("RATE_LIMITED"),
    })
    const r = await exportWorkspaceData(CTX, client)
    expect(!r.ok && r.error.code).toBe("rate_limited")
    expect(calls).toHaveLength(1)
  })

  it("purges each due school on its own and reports failures by id", async () => {
    const { client } = fakeClient(
      {
        purge_due_workspace: (args) =>
          (args as { p_workspace_id: string }).p_workspace_id === "w2"
            ? refuse("FILES_PRESENT")
            : { data: null, error: null },
      },
      { data: [{ id: "w1" }, { id: "w2" }], error: null }
    )
    expect(await purgeDueWorkspaces(client)).toEqual({
      ok: true,
      data: { purged: ["w1"], failed: [{ id: "w2", code: "FILES_PRESENT" }] },
    })
  })
})
