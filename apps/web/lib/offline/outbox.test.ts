import { describe, expect, it, vi } from "vitest"

import {
  classify,
  enqueue,
  OUTBOX_LIMIT,
  replay,
  type OutboxDraft,
  type OutboxItem,
  type OutboxStore,
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
const ok = (updatedAt = "v2") => ({ ok: true as const, data: { updatedAt } })
const fail = (code: string, root?: string) => ({
  ok: false as const,
  error: {
    code,
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
    [fail("unauthenticated"), "retry"],
    [fail("conflict", "WRONG_ACCOUNT"), "retry"],
    [fail("conflict", "CONFLICT"), "conflict"],
    [fail("forbidden", "OUTSIDE_EDIT_WINDOW"), "needs_attention"],
    [fail("validation_failed"), "needs_attention"],
    [fail("payment_required"), "needs_attention"],
    [fail("conflict", "ROSTER_CHANGED"), "needs_attention"],
  ] as const)("%j → %s", (reply, outcome) => {
    expect(classify(reply)).toBe(outcome)
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
    const send = vi.fn(async () => ok())
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
    const send = vi.fn(async () => ok())
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
})
