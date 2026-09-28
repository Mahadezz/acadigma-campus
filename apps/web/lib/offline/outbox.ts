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
  lastError: { code: string; message: string; root?: string | null } | null
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
 * §4.3 / §5.2: queue a save. The NEWEST item for the same thing takes the
 * new payload and key, keeping its base version — but only while it is
 * waiting and has never been sent (`attempts === 0`): her own unsent save is
 * not a version the server has seen. Otherwise (sending, or tried and back to
 * waiting) the new save queues behind it and is rebased when it lands
 * (`replay`), so the last save is always the last one sent (review, #89).
 */
export async function enqueue(
  store: OutboxStore,
  draft: OutboxDraft,
  now = Date.now()
): Promise<"queued" | "replaced" | "full"> {
  const items = await store.list()
  const newest = items
    .filter(
      (i) =>
        i.entityKey === draft.entityKey &&
        i.userId === draft.userId &&
        i.workspaceId === draft.workspaceId &&
        (i.status === "pending" || i.status === "sending")
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const pending =
    newest?.status === "pending" && newest.attempts === 0 ? newest : undefined
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
 *
 * `lock` guards each read-and-write of the store, never the send: a save made
 * while an item is on the wire is queued at once (behind it, §5.2) instead of
 * waiting on the network — and is sent later in the same run, because every
 * turn re-reads the store. The caller runs one replay at a time.
 */
export async function replay(
  store: OutboxStore,
  opts: {
    userId: string
    workspaceId: string
    send: (item: OutboxItem) => Promise<SendReply>
    onSent?: (item: OutboxItem, updatedAt: string) => void
    lock?: <T>(fn: () => Promise<T>) => Promise<T>
  }
): Promise<void> {
  const lock = opts.lock ?? ((fn) => fn())
  const tried = new Set<string>()
  // After the send, write back only if the item is still there: a sign-out
  // may have deleted the outbox meanwhile (review, #89).
  const writeBack = (item: OutboxItem) =>
    lock(async () => {
      if ((await store.list()).some((i) => i.id === item.id)) {
        await store.put(item)
      }
    })

  for (;;) {
    // The oldest waiting item not yet tried in this run, marked as sending.
    // ("sending" left by a closed tab is resent: same key, stored result.)
    const sending = await lock(async () => {
      const next = (await store.list())
        .filter(
          (i) =>
            i.userId === opts.userId &&
            i.workspaceId === opts.workspaceId &&
            (i.status === "pending" || i.status === "sending") &&
            !tried.has(i.id)
        )
        .sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!next) return null
      const marked = {
        ...next,
        status: "sending" as const,
        attempts: next.attempts + 1,
      }
      await store.put(marked)
      return marked
    })
    if (!sending) return
    tried.add(sending.id)

    let reply: SendReply
    try {
      reply = await opts.send(sending)
    } catch {
      await writeBack({ ...sending, status: "pending" })
      return
    }
    const outcome = classify(reply)

    if (reply.ok) {
      const updatedAt = reply.data.updatedAt
      await lock(async () => {
        await store.remove(sending.id)
        // A later save of the same thing made while this one was sending
        // carries the same base; move it onto the version this one created.
        for (const later of await store.list()) {
          if (
            later.status === "pending" &&
            later.entityKey === sending.entityKey &&
            later.payload.expectedUpdatedAt ===
              sending.payload.expectedUpdatedAt
          ) {
            await store.put({
              ...later,
              payload: { ...later.payload, expectedUpdatedAt: updatedAt },
            })
          }
        }
      })
      opts.onSent?.(sending, updatedAt)
      continue
    }

    const lastError = {
      code: reply.error.code,
      message: reply.error.message,
      // The named reason (e.g. SECTION_ARCHIVED): the UI shows its own
      // translated text for it, not the server's English message.
      root: reply.error.fieldErrors?._root?.[0] ?? null,
    }
    await writeBack({
      ...sending,
      status:
        outcome === "retry"
          ? "pending"
          : outcome === "conflict"
            ? "conflict"
            : "needs_attention",
      lastError,
    })
    if (outcome === "retry") return
  }
}
