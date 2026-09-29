import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OutboxItem } from "./outbox"
import type { SessionCheck } from "./purge"

/**
 * F-ID-11 Part 2b (D-310): §4.6 — an expired session pauses the queue (and
 * says so) instead of retrying; the same user signing in resumes it. §4.4 —
 * a successful request while items wait triggers a send, throttled.
 */

let items: OutboxItem[] = []
vi.mock("./outbox-db", () => ({
  outboxUserIds: async () => ["u1"],
  notifyOutboxChanged: () => undefined,
  outboxEvents: new EventTarget(),
  deleteOutbox: async () => undefined,
  outboxStore: () => ({
    list: async () => items.map((i) => ({ ...i })),
    put: async (item: OutboxItem) => {
      items = [...items.filter((i) => i.id !== item.id), item]
    },
    remove: async (id: string) => {
      items = items.filter((i) => i.id !== id)
    },
  }),
}))
let check: SessionCheck = { kind: "signed_out" }
vi.mock("./check", () => ({
  checkSession: async () => ({ purged: false, check }),
}))
const save = vi.fn()
vi.mock("@/app/(school)/app/attendance/actions", () => ({
  saveAttendanceSession: (input: unknown) => save(input),
}))

const { outboxPaused, sendQueued, watchSuccessfulRequests } =
  await import("./outbox-client")

const waiting = (id: string): OutboxItem => ({
  id,
  userId: "u1",
  workspaceId: "w1",
  kind: "attendance.save",
  entityKey: `attendance:s:${id}`,
  payload: {
    idempotencyKey: `k-${id}`,
    sectionId: "s",
    date: "2026-09-27",
    records: [{ studentId: "st", status: "present" }],
    bulkMarked: false,
    allowNonSchoolDay: false,
    expectedUpdatedAt: null,
  },
  summary: "",
  detail: "",
  createdAt: 1,
  attempts: 0,
  status: "pending",
  lastError: null,
})
const signedIn: SessionCheck = {
  kind: "signed_in",
  userId: "u1",
  workspaceId: "w1",
  role: "teacher",
  scope: null,
  activeWorkspaceIds: ["w1"],
}

beforeEach(() => {
  items = [waiting("a"), waiting("b")]
  save.mockReset()
})

describe("§4.6 session expiry", () => {
  it("a signed-out check pauses the queue; nothing is sent, nothing lost", async () => {
    check = { kind: "signed_out" }
    await sendQueued("u1")
    expect(outboxPaused()).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(items).toHaveLength(2)
  })

  it("an UNAUTHENTICATED reply pauses instead of retrying", async () => {
    check = signedIn
    save.mockResolvedValue({
      ok: false,
      error: { code: "unauthenticated", message: "Sign in" },
    })
    await sendQueued("u1")
    expect(save).toHaveBeenCalledTimes(1)
    expect(outboxPaused()).toBe(true)
    expect(items.every((i) => i.status === "pending")).toBe(true)
  })

  it("the same user signed in again resumes: everything sends, the pause clears", async () => {
    check = signedIn
    save.mockResolvedValue({ ok: true, data: { updatedAt: "v2" } })
    await sendQueued("u1")
    expect(save).toHaveBeenCalledTimes(2)
    expect(items).toHaveLength(0)
    expect(outboxPaused()).toBe(false)
  })
})

describe("§4.4 after a successful request", () => {
  it("sends once per window for successful fetches, ignoring failed ones", () => {
    let observe: ((list: { getEntries(): unknown[] }) => void) | null = null
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(cb: typeof observe) {
          observe = cb
        }
        observe() {}
        disconnect() {}
      }
    )
    const send = vi.fn()
    let now = 0
    const stop = watchSuccessfulRequests(send, 30_000, () => now)
    const entry = (responseStatus?: number) => ({
      getEntries: () => [
        { initiatorType: "fetch", name: "/app/x", responseStatus },
      ],
    })
    observe!(entry(0))
    expect(send).not.toHaveBeenCalled()
    observe!(entry(200))
    observe!(entry(200))
    expect(send).toHaveBeenCalledTimes(1)
    now = 31_000
    observe!(entry(undefined)) // Safari has no responseStatus
    expect(send).toHaveBeenCalledTimes(2)
    stop()
    vi.unstubAllGlobals()
  })
})
