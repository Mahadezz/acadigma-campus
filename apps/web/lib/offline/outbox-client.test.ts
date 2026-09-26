import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-11 §4.7 (D-309 review): the sign-out question counts, and sign-out
 * deletes, only the signed-in user's outbox. Another teacher's queue on a
 * shared phone is never counted as theirs or wiped by their sign-out.
 */

const deleted: string[] = []
const queued: Record<string, number> = { u1: 2, u2: 3 }
vi.mock("./outbox-db", () => ({
  outboxUserIds: async () => Object.keys(queued),
  notifyOutboxChanged: () => undefined,
  outboxEvents: new EventTarget(),
  deleteOutbox: async (id: string) => void deleted.push(id),
  outboxStore: (userId: string) => ({
    list: async () => Array.from({ length: queued[userId] ?? 0 }),
  }),
}))
vi.mock("@/app/(school)/app/attendance/actions", () => ({
  saveAttendanceSession: vi.fn(),
}))

const { countQueued, deleteOwnOutbox } = await import("./outbox-client")

beforeEach(() => {
  deleted.length = 0
})

describe("sign-out touches only the signed-in user's outbox", () => {
  it("counts only their own items", async () => {
    expect(await countQueued("u1")).toBe(2)
    expect(await countQueued(null)).toBe(0)
  })

  it("deletes only their own outbox", async () => {
    await deleteOwnOutbox("u1")
    expect(deleted).toEqual(["u1"])
  })

  it("deletes nothing when the user is unknown", async () => {
    await deleteOwnOutbox(null)
    expect(deleted).toEqual([])
  })
})
