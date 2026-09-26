import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OutboxItem } from "./outbox"
import type { SessionCheck } from "./purge"

/**
 * F-ID-11 §4.8 / §5.7, the outbox half of the purge (D-309): a removed
 * membership takes that workspace's queued work; another user's outbox never
 * survives this user's check; a role change and a signed-out check keep it.
 */

const deleted: string[] = []
let items: OutboxItem[] = []
let users: string[] | null = []
const openStore = vi.fn(() => ({
  list: async () => items,
  remove: async (id: string) => {
    items = items.filter((i) => i.id !== id)
  },
}))
vi.mock("./outbox-db", () => ({
  outboxUserIds: async () => users,
  deleteOutbox: async (id: string) => void deleted.push(id),
  outboxStore: () => openStore(),
}))

const { checkSession } = await import("./check")

const item = (id: string, workspaceId: string) =>
  ({ id, userId: "u1", workspaceId }) as OutboxItem

function respond(check: SessionCheck) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(check))
  )
}
const signedIn = (over: object = {}): SessionCheck => ({
  kind: "signed_in",
  userId: "u1",
  workspaceId: "w1",
  role: "teacher",
  scope: null,
  activeWorkspaceIds: ["w1"],
  ...over,
})

beforeEach(() => {
  vi.stubGlobal("indexedDB", {})
  vi.stubGlobal("caches", { keys: async () => [], delete: async () => true })
  deleted.length = 0
  users = ["u1", "u2"]
  items = [item("a", "w1"), item("b", "w2")]
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("outbox purge on the session check", () => {
  it("deletes another user's outbox and this user's items for a workspace they left", async () => {
    await checkSession()
    expect(deleted).toEqual(["u2"])
    expect(items.map((i) => i.id)).toEqual(["a"])
  })

  it("keeps the items when only the role changed", async () => {
    respond(signedIn({ role: "admin", activeWorkspaceIds: ["w1", "w2"] }))
    await checkSession()
    expect(items.map((i) => i.id)).toEqual(["a", "b"])
  })

  it("keeps everything when signed out (same-user resume, §4.6) or unknown", async () => {
    for (const check of [
      { kind: "signed_out" },
      { kind: "unknown" },
    ] as const) {
      respond(check)
      await checkSession()
    }
    expect(deleted).toEqual([])
    expect(items).toHaveLength(2)
  })

  it("does not create an outbox for a user who has none", async () => {
    users = ["u2"]
    openStore.mockClear()
    await checkSession()
    expect(openStore).not.toHaveBeenCalled()
    expect(deleted).toEqual(["u2"])
  })
})

beforeEach(() => respond(signedIn()))
