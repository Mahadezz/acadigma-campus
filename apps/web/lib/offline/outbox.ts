import type { ApiError, SaveAttendanceInput } from "@acadigma/contracts"

/**
 * F-ID-11 Part 2a (D-309): the outbox rules, apart from where items are kept
 * (`outbox-db.ts`, IndexedDB) and how they are sent (`outbox-client.ts`).
 *
 * An item is one queued save. Replay sends items one at a time, oldest first,
 * through the feature's normal server action with the item's idempotency key —
 * only for the user and workspace that queued them (§5.8).
 */

/** §5.5: more than this and a new offline save is refused, nothing evicted. */
export const OUTBOX_LIMIT = 500

/** §5.1 `OUTBOX_KINDS`: the actions that queue. Attendance only in 2a. */
export type OutboxKind = "attendance.save"

export type OutboxStatus =
  "pending" | "sending" | "conflict" | "needs_attention"

export type OutboxItem = {
  id: string
  userId: string
  workspaceId: string
  kind: OutboxKind
  /** One item per thing saved, e.g. `attendance:<section>:<date>`. */
  entityKey: string
  /** The action's input; `idempotencyKey` and `expectedUpdatedAt` inside. */
  payload: SaveAttendanceInput
  /** A plain line for the queue sheet ("Attendance · 6 – A · Sun 27 Sep"). */
  summary: string
  /** What was entered, readable aloud to an admin ("Absent: Rahim, Karim"). */
  detail: string
  createdAt: number
  attempts: number
  status: OutboxStatus
  lastError: { code: string; message: string } | null
}

export type OutboxDraft = Pick<
  OutboxItem,
  | "userId"
  | "workspaceId"
  | "kind"
  | "entityKey"
  | "payload"
  | "summary"
  | "detail"
>

export type OutboxStore = {
  list(): Promise<OutboxItem[]>
  put(item: OutboxItem): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * §4.3 / §5.2: queue a save. A pending item for the same thing takes the new
 * payload and key but keeps its base version — her own unsent save is not a
 * version the server has seen. An item already sending is left alone; the new
 * one queues behind it and is rebased when that one lands (`replay`).
 */
export async function enqueue(
  store: OutboxStore,
  draft: OutboxDraft,
  now = Date.now()
): Promise<"queued" | "replaced" | "full"> {
  const items = await store.list()
  const pending = items.find(
    (i) =>
      i.status === "pending" &&
      i.entityKey === draft.entityKey &&
      i.userId === draft.userId &&
      i.workspaceId === draft.workspaceId
  )
  if (pending) {
    await store.put({
      ...pending,
      payload: {
        ...draft.payload,
        expectedUpdatedAt: pending.payload.expectedUpdatedAt,
      },
      summary: draft.summary,
      detail: draft.detail,
    })
    return "replaced"
  }
  if (items.length >= OUTBOX_LIMIT) return "full"
  await store.put({
    ...draft,
    id: crypto.randomUUID(),
    createdAt: now,
    attempts: 0,
    status: "pending",
    lastError: null,
  })
  return "queued"
}

export type SendReply =
  | { ok: true; data: { updatedAt: string } }
  | { ok: false; error: Pick<ApiError, "code" | "message" | "fieldErrors"> }

export type Outcome = "sent" | "retry" | "conflict" | "needs_attention"

/** Replies that say "not now", not "no": the item waits for the next trigger. */
const RETRY_CODES = new Set([
  "dependency_unavailable",
  "internal",
  "rate_limited",
  "unauthenticated",
])

/** §4.4, by the server's named error. */
export function classify(reply: SendReply): Outcome {
  if (reply.ok) return "sent"
  const root = reply.error.fieldErrors?._root?.[0]
  // Sent while another account or school is active: it waits for its own.
  if (RETRY_CODES.has(reply.error.code) || root === "WRONG_ACCOUNT") {
    return "retry"
  }
  if (root === "CONFLICT") return "conflict"
  return "needs_attention"
}

/**
 * §4.4: send what this user queued for this workspace, oldest first, one at
 * a time. A network error or a "not now" reply stops the run (the next
 * trigger retries); a conflict or a refusal is kept with its reason and the
 * run carries on. Nothing is dropped without a success.
 */
export async function replay(
  store: OutboxStore,
  opts: {
    userId: string
    workspaceId: string
    send: (item: OutboxItem) => Promise<SendReply>
    onSent?: (item: OutboxItem, updatedAt: string) => void
  }
): Promise<void> {
  const queue = (await store.list())
    .filter(
      (i) =>
        i.userId === opts.userId &&
        i.workspaceId === opts.workspaceId &&
        // "sending" here was left by a closed tab (replay runs under a lock):
        // resent with the same key, the server returns the stored result.
        (i.status === "pending" || i.status === "sending")
    )
    .sort((a, b) => a.createdAt - b.createdAt)

  for (const [n, item] of queue.entries()) {
    const sending = {
      ...item,
      status: "sending" as const,
      attempts: item.attempts + 1,
    }
    await store.put(sending)
    let reply: SendReply
    try {
      reply = await opts.send(sending)
    } catch {
      await store.put({ ...sending, status: "pending" })
      return
    }
    const outcome = classify(reply)
    if (reply.ok) {
      await store.remove(item.id)
      // A later save of the same thing made while this one was sending
      // carries the same base; move it onto the version this one created.
      for (const later of queue.slice(n + 1)) {
        if (
          later.entityKey === item.entityKey &&
          later.payload.expectedUpdatedAt === item.payload.expectedUpdatedAt
        ) {
          later.payload = {
            ...later.payload,
            expectedUpdatedAt: reply.data.updatedAt,
          }
          await store.put(later)
        }
      }
      opts.onSent?.(item, reply.data.updatedAt)
      continue
    }
    const lastError = { code: reply.error.code, message: reply.error.message }
    if (outcome === "retry") {
      await store.put({ ...sending, status: "pending", lastError })
      return
    }
    await store.put({ ...sending, status: outcome, lastError })
  }
}
