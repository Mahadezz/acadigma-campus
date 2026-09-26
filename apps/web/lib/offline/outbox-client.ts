"use client"

import { useEffect, useState } from "react"

import { saveAttendanceSession } from "@/app/(school)/app/attendance/actions"

import { checkSession, snapshotUserId } from "./check"
import {
  enqueue,
  replay,
  type OutboxDraft,
  type OutboxItem,
  type OutboxStore,
} from "./outbox"
import { deleteOutbox, outboxStore, outboxUserIds } from "./outbox-db"

/**
 * F-ID-11 Part 2a (D-309): the outbox as the app uses it — queue a save,
 * send what is waiting, watch it from the chip. Rules live in `outbox.ts`,
 * storage in `outbox-db.ts`.
 */

const listeners = new Set<() => void>()
const changed = () => listeners.forEach((fn) => fn())

const sentListeners = new Set<(entityKey: string, updatedAt: string) => void>()
/** A queued save landed: the version it created is the screen's next base. */
export function onOutboxSent(
  fn: (entityKey: string, updatedAt: string) => void
): () => void {
  sentListeners.add(fn)
  return () => void sentListeners.delete(fn)
}

// Queueing and sending take turns, across tabs too (Web Locks): a save that
// replaces a pending item must never race the replay sending it.
let tail: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("acadigma-outbox", fn) as Promise<T>
  }
  const run = tail.then(fn, fn)
  tail = run.catch(() => undefined)
  return run
}

function liveStore(userId: string): OutboxStore {
  const store = outboxStore(userId)
  return {
    list: store.list,
    put: async (item) => {
      await store.put(item)
      changed()
    },
    remove: async (id) => {
      await store.remove(id)
      changed()
    },
  }
}

/** §4.3: keep a save on the phone. */
export function queueSave(
  draft: OutboxDraft
): Promise<"queued" | "replaced" | "full"> {
  return withLock(() => enqueue(liveStore(draft.userId), draft))
}

async function send(item: OutboxItem) {
  // `queuedFor`: the action refuses it under any other user or workspace.
  return saveAttendanceSession({
    ...item.payload,
    queuedFor: { userId: item.userId, workspaceId: item.workspaceId },
  })
}

let running: Promise<void> | null = null
/**
 * §4.4: send this user's waiting items for the workspace the server says is
 * active now — after the session check (and its purges) confirmed who is
 * here. One run at a time; a trigger during a run joins it.
 */
export function sendQueued(userId: string): Promise<void> {
  running ??= (async () => {
    if (!navigator.onLine) return
    const { check } = await checkSession()
    if (check.kind !== "signed_in" || check.userId !== userId) return
    const workspaceId = check.workspaceId
    if (!workspaceId) return
    await withLock(() =>
      replay(liveStore(userId), {
        userId,
        workspaceId,
        send,
        onSent: (item, updatedAt) =>
          sentListeners.forEach((fn) => fn(item.entityKey, updatedAt)),
      })
    )
  })().finally(() => {
    running = null
  })
  return running
}

/** The save of this thing still waiting to send, if any. */
export async function queuedItem(
  userId: string,
  entityKey: string
): Promise<OutboxItem | undefined> {
  try {
    return (await outboxStore(userId).list()).find(
      (i) =>
        i.entityKey === entityKey &&
        (i.status === "pending" || i.status === "sending")
    )
  } catch {
    return undefined
  }
}

/** Try again (§4.10): back to waiting, then send. */
export async function retryItem(userId: string, id: string): Promise<void> {
  await withLock(async () => {
    const store = liveStore(userId)
    const item = (await store.list()).find((i) => i.id === id)
    if (item) await store.put({ ...item, status: "pending", lastError: null })
  })
  await sendQueued(userId)
}

/** Delete (§4.10): only ever the user's own choice. */
export function deleteItem(userId: string, id: string): Promise<void> {
  return withLock(() => liveStore(userId).remove(id))
}

/** Every outbox on this device (the last-seen user where it cannot be listed). */
async function deviceUsers(): Promise<string[]> {
  const listed = await outboxUserIds()
  if (listed) return listed
  const last = snapshotUserId()
  return last ? [last] : []
}

/** Everything waiting on this device, for the sign-out question (§4.7). */
export async function countQueued(): Promise<number> {
  const users = await deviceUsers()
  let n = 0
  for (const id of users) n += (await outboxStore(id).list()).length
  return n
}

/** Sign-out (§4.7): every outbox on this device goes with the session. */
export async function deleteAllOutboxes(): Promise<void> {
  const users = await deviceUsers()
  await Promise.all(users.map(deleteOutbox))
  changed()
}

/** The user's items, live. */
export function useOutbox(userId: string): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([])
  useEffect(() => {
    let live = true
    const load = () => {
      outboxStore(userId)
        .list()
        .then((next) => {
          if (live) setItems(next.sort((a, b) => a.createdAt - b.createdAt))
        })
        .catch(() => undefined)
    }
    load()
    listeners.add(load)
    return () => {
      live = false
      listeners.delete(load)
    }
  }, [userId])
  return items
}
