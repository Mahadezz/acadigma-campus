import { describe, expect, it, vi } from "vitest"

import type { ApiErrorCode } from "@acadigma/contracts"

import {
  classify,
  enqueue,
  OUTBOX_LIMIT,
  othersExpired,
  resolveConflict,
  replay,
  type OutboxDraft,
  type OutboxItem,
  type OutboxStore,
  type SendReply,
} from "./outbox"

/**
 * F-ID-11 Part 2a (§4.3, §4.4, §5.2, §5.5): the outbox rules, apart from
 * IndexedDB — replace-on-pending, the limit, the outcome classifier and the
 * serial replay that only ever sends as the user and workspace that queued.
 */

function memoryStore(items: OutboxItem[] = []): OutboxStore & {
  items: Map<string, OutboxItem>
} {
  const map = new Map(items.map((i) => [i.id, i]))
  return {
    items: map,
    list: async () => [...map.values()].map((i) => structuredClone(i)),
    put: async (item) => void map.set(item.id, structuredClone(item)),
    remove: async (id) => void map.delete(id),
  }
}

const U = "u1"
const W = "w1"
const payload = (key: string, base: string | null = "v1") => ({
  idempotencyKey: key,
  sectionId: "s1",
  date: "2026-09-27",
  records: [{ studentId: "st1", status: "present" as const }],
  bulkMarked: false,
  allowNonSchoolDay: false,
  expectedUpdatedAt: base,
})
const draft = (key: string, over: Partial<OutboxDraft> = {}): OutboxDraft => ({
  userId: U,
  workspaceId: W,
  kind: "attendance.save",
  entityKey: "attendance:s1:2026-09-27",
  payload: payload(key),
  summary: "Attendance · 6 – A · Sun 27 Sep",
  detail: "Absent: none",
  ...over,
})
const ok = (updatedAt = "v2"): SendReply => ({
  ok: true as const,
  data: { updatedAt },
})
const fail = (code: string, root?: string): SendReply => ({
  ok: false as const,
  error: {
    code: code as ApiErrorCode,
    message: `${code} ${root ?? ""}`,
    ...(root ? { fieldErrors: { _root: [root] } } : {}),
  },
})

describe("enqueue", () => {
  it("queues a new item, pending, with the save's own key", async () => {
    const store = memoryStore()
    expect(await enqueue(store, draft("k1"), 100)).toBe("queued")
    const [item] = store.items.values()
    expect(item).toMatchObject({
      status: "pending",
      attempts: 0,
      createdAt: 100,
      payload: { idempotencyKey: "k1" },
    })
  })

  it("replaces a pending item for the same class and day, keeping its base version", async () => {
    // Save, correct one student, save again — all offline: one item, one
    // session, no CONFLICT against herself, no IDEMPOTENCY_KEY_REUSED.
    const store = memoryStore()
    await enqueue(store, draft("k1"))
    const corrected = draft("k2", { payload: payload("k2", "ignored") })
    corrected.payload.records = [{ studentId: "st1", status: "absent" }]
    expect(await enqueue(store, corrected)).toBe("replaced")
    expect(store.items.size).toBe(1)
    const [item] = store.items.values()
    expect(item!.payload).toMatchObject({
      idempotencyKey: "k2",
      expectedUpdatedAt: "v1",
      records: [{ studentId: "st1", status: "absent" }],
    })
  })

  it("does not replace an item that is sending, or one for another class", async () => {
    const store = memoryStore()
    await enqueue(store, draft("k1"))
    const [first] = store.items.values()
    await store.put({ ...first!, status: "sending" })
    await enqueue(store, draft("k2"))
    await enqueue(store, draft("k3", { entityKey: "attendance:s2:2026-09-27" }))
    expect(store.items.size).toBe(3)
  })

  it("refuses at the limit and evicts nothing", async () => {
    const store = memoryStore()
    for (let i = 0; i < OUTBOX_LIMIT; i++) {
      await enqueue(store, draft(`k${i}`, { entityKey: `e${i}` }))
    }
    expect(await enqueue(store, draft("x", { entityKey: "new" }))).toBe("full")
    expect(store.items.size).toBe(OUTBOX_LIMIT)
  })
})

describe("classify (§4.4)", () => {
  it.each([
    [ok(), "sent"],
    [fail("dependency_unavailable"), "retry"],
    [fail("internal"), "retry"],
    [fail("rate_limited"), "retry"],
    [fail("unauthenticated"), "paused"],
    [fail("conflict", "WRONG_ACCOUNT"), "retry"],
    [fail("conflict", "CONFLICT"), "conflict"],
    [fail("forbidden", "OUTSIDE_EDIT_WINDOW"), "needs_attention"],
    [fail("validation_failed"), "needs_attention"],
    [fail("payment_required"), "needs_attention"],
    [fail("conflict", "ROSTER_CHANGED"), "needs_attention"],
  ] as const)("%j → %s", (reply, outcome) => {
    expect(classify(reply as SendReply)).toBe(outcome)
  })
})

describe("replay", () => {
  async function queued(...drafts: OutboxDraft[]) {
    const store = memoryStore()
    let t = 0
    for (const d of drafts) await enqueue(store, d, ++t)
    return store
  }

  it("sends oldest first, one at a time, and removes what was sent", async () => {
    const store = await queued(
      draft("k1", { entityKey: "a" }),
      draft("k2", { entityKey: "b" })
    )
    const order: string[] = []
    const send = vi.fn(async (item: OutboxItem) => {
      order.push(item.payload.idempotencyKey)
      return ok()
    })
    await replay(store, { userId: U, workspaceId: W, send })
    expect(order).toEqual(["k1", "k2"])
    expect(store.items.size).toBe(0)
  })

  it("sends nothing queued by another user or for another workspace", async () => {
    const store = await queued(
      draft("mine"),
      draft("theirs", { userId: "u2", entityKey: "b" }),
      draft("other-school", { workspaceId: "w2", entityKey: "c" })
    )
    const send = vi.fn(async (_item: OutboxItem) => ok())
    await replay(store, { userId: U, workspaceId: W, send })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]![0].payload.idempotencyKey).toBe("mine")
    expect(
      [...store.items.values()].map((i) => i.payload.idempotencyKey)
    ).toEqual(["theirs", "other-school"])
  })

  it("keeps the item and stops on a network error or a retryable reply", async () => {
    const store = await queued(
      draft("k1", { entityKey: "a" }),
      draft("k2", { entityKey: "b" })
    )
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await replay(store, { userId: U, workspaceId: W, send })
    expect(send).toHaveBeenCalledTimes(1)
    expect([...store.items.values()].map((i) => i.status)).toEqual([
      "pending",
      "pending",
    ])
    send.mockResolvedValueOnce(fail("dependency_unavailable"))
    await replay(store, { userId: U, workspaceId: W, send })
    expect(send).toHaveBeenCalledTimes(2)
    expect(store.items.size).toBe(2)
  })

  it("surfaces a CONFLICT and a refusal, never retries them, and carries on", async () => {
    const store = await queued(
      draft("k1", { entityKey: "a" }),
      draft("k2", { entityKey: "b" }),
      draft("k3", { entityKey: "c" })
    )
    const send = vi
      .fn()
      .mockResolvedValueOnce(fail("conflict", "CONFLICT"))
      .mockResolvedValueOnce(fail("validation_failed", "SECTION_ARCHIVED"))
      .mockResolvedValueOnce(ok())
    await replay(store, { userId: U, workspaceId: W, send })
    const items = [...store.items.values()]
    expect(items.map((i) => [i.status, i.lastError?.code])).toEqual([
      ["conflict", "conflict"],
      ["needs_attention", "validation_failed"],
    ])
    await replay(store, { userId: U, workspaceId: W, send })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it("resends an item left 'sending' by a closed tab (same key: the server returns the stored result)", async () => {
    const store = await queued(draft("k1"))
    const [item] = store.items.values()
    await store.put({ ...item!, status: "sending" })
    const send = vi.fn(async (_item: OutboxItem) => ok())
    await replay(store, { userId: U, workspaceId: W, send })
    expect(send.mock.calls[0]![0].payload.idempotencyKey).toBe("k1")
    expect(store.items.size).toBe(0)
  })

  it("rebases a later save of the same class onto the version the first one returned", async () => {
    // The second save was made while the first was sending, so it carries the
    // same base: sent unchanged, it would CONFLICT against her own first save.
    const store = await queued(draft("k1"))
    const [first] = store.items.values()
    await store.put({ ...first!, status: "sending" })
    await enqueue(store, draft("k2"), 5)
    const sent: (string | null)[] = []
    const send = vi.fn(async (item: OutboxItem) => {
      sent.push(item.payload.expectedUpdatedAt)
      return ok(`after-${item.payload.idempotencyKey}`)
    })
    const onSent = vi.fn()
    await replay(store, { userId: U, workspaceId: W, send, onSent })
    expect(sent).toEqual(["v1", "after-k1"])
    expect(onSent).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityKey: "attendance:s1:2026-09-27" }),
      "after-k2"
    )
  })
  it("a save made while another is on the wire is never lost: it queues behind and goes next", async () => {
    // The lock is not held during the send: queueing stays instant, and the
    // correction lands as its own item, rebased once the first one succeeds.
    const store = await queued(draft("k1"))
    const sent: [string, string | null][] = []
    const send = vi.fn(async (item: OutboxItem) => {
      sent.push([item.payload.idempotencyKey, item.payload.expectedUpdatedAt])
      if (item.payload.idempotencyKey === "k1") {
        expect(await enqueue(store, draft("k2"), 50)).toBe("queued")
      }
      return ok(`after-${item.payload.idempotencyKey}`)
    })
    await replay(store, { userId: U, workspaceId: W, send })
    expect(sent).toEqual([
      ["k1", "v1"],
      ["k2", "after-k1"],
    ])
    expect(store.items.size).toBe(0)
  })

  it("a correction made while the send fails replaces the waiting item, keeping the base", async () => {
    const store = await queued(draft("k1"))
    const send = vi.fn(async (item: OutboxItem) => {
      if (item.payload.idempotencyKey === "k1") {
        await enqueue(store, draft("k2"), 50)
      }
      throw new TypeError("Failed to fetch")
    })
    await replay(store, { userId: U, workspaceId: W, send })
    const keys = [...store.items.values()].map((i) => [
      i.status,
      i.payload.idempotencyKey,
      i.payload.expectedUpdatedAt,
    ])
    // k1 back to waiting; k2 behind it with the same base. Nothing dropped.
    expect(keys).toEqual([
      ["pending", "k1", "v1"],
      ["pending", "k2", "v1"],
    ])
  })
  it.each([
    ["oldest first", false],
    ["newest first", true],
  ])(
    "three saves with a failed send in the middle: the server ends on v3 (%s)",
    async (_, newestFirst) => {
      // Review blocker (#89): IndexedDB returns items in random-UUID order.
      // Listed oldest first, the old rule merged v3 into the OLDER, already
      // tried item; replay then sent v3 and finally v2 over it.
      const store = memoryStore()
      const list = store.list
      store.list = async () => (newestFirst ? (await list()).reverse() : list())
      const server = { version: "v0" as string | null, marks: "", n: 0 }
      const save = (key: string, marks: string, t: number) => {
        const d = draft(key, { payload: payload(key, "v0") })
        d.detail = marks
        return enqueue(store, d, t)
      }
      const send = vi.fn(async (item: OutboxItem) => {
        if (item.payload.expectedUpdatedAt !== server.version) {
          return fail("conflict", "CONFLICT")
        }
        server.version = `s${++server.n}`
        server.marks = item.detail
        return ok(server.version)
      })

      await save("k1", "v1", 1)
      // The first send fails; v2 is saved while it is on the wire.
      await replay(store, {
        userId: U,
        workspaceId: W,
        send: async () => {
          await save("k2", "v2", 2)
          throw new TypeError("Failed to fetch")
        },
      })
      await save("k3", "v3", 3)
      await replay(store, { userId: U, workspaceId: W, send })

      expect(server.marks).toBe("v3")
      expect(store.items.size).toBe(0)
      expect(send.mock.results.every((r) => r.type === "return")).toBe(true)
    }
  )
  it("a sign-out during a send (outbox deleted) is not undone by the send's outcome", async () => {
    for (const outcome of ["throw", "retry", "refused"] as const) {
      const store = await queued(draft("k1"))
      const send = vi.fn(async () => {
        store.items.clear() // sign-out deleted the database meanwhile
        if (outcome === "throw") throw new TypeError("Failed to fetch")
        return outcome === "retry"
          ? fail("dependency_unavailable")
          : fail("validation_failed", "SECTION_ARCHIVED")
      })
      await replay(store, { userId: U, workspaceId: W, send })
      expect(store.items.size).toBe(0)
    }
  })
})

describe("Part 2b (D-310)", () => {
  it("an expired session pauses the queue (§4.6): the item waits, the run stops and says so", async () => {
    const store = memoryStore()
    await enqueue(store, draft("k1", { entityKey: "a" }), 1)
    await enqueue(store, draft("k2", { entityKey: "b" }), 2)
    const send = vi.fn(async () => fail("unauthenticated"))
    expect(await replay(store, { userId: U, workspaceId: W, send })).toBe(
      "paused"
    )
    expect(send).toHaveBeenCalledTimes(1)
    expect([...store.items.values()].map((i) => i.status)).toEqual([
      "pending",
      "pending",
    ])
  })

  it("a run that sends everything reports done; a network error reports retry", async () => {
    const store = memoryStore()
    await enqueue(store, draft("k1"), 1)
    const failing = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    expect(
      await replay(store, { userId: U, workspaceId: W, send: failing })
    ).toBe("retry")
    expect(
      await replay(store, { userId: U, workspaceId: W, send: async () => ok() })
    ).toBe("done")
  })

  it("another user's outbox expires only when everything in it is 14 days old", () => {
    const now = 100 * 86_400_000
    const at = (days: number) => ({ createdAt: now - days * 86_400_000 })
    expect(othersExpired([at(15), at(14)], now)).toBe(true)
    expect(othersExpired([at(15), at(13)], now)).toBe(false)
    expect(othersExpired([], now)).toBe(true)
  })

  it("resolve (conflict sheet): the chosen records go on the colleague's version under a new key, waiting", async () => {
    const store = memoryStore()
    await enqueue(store, draft("k1"), 1)
    const [item] = [...store.items.values()]
    await replay(store, {
      userId: U,
      workspaceId: W,
      send: async () => fail("conflict", "CONFLICT"),
    })
    const records = [{ studentId: "st1", status: "absent" as const }]
    await resolveConflict(store, item!.id, records, "v9", "k-new")
    const [after] = [...store.items.values()]
    expect(after).toMatchObject({
      status: "pending",
      lastError: null,
      attempts: 0,
      payload: {
        idempotencyKey: "k-new",
        expectedUpdatedAt: "v9",
        records,
      },
    })
  })
})
