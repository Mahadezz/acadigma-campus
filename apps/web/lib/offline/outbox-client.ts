"use client"

import { useEffect, useState } from "react"

import { saveAttendanceSession } from "@/app/(school)/app/attendance/actions"

import { checkSession } from "./check"
import {
  enqueue,
  replay,
  type OutboxDraft,
  type OutboxItem,
  type OutboxStore,
} from "./outbox"
import {
  deleteOutbox,
  notifyOutboxChanged,
  outboxEvents,
  outboxStore,
} from "./outbox-db"

/**
 * F-ID-11 Part 2a (D-309): the outbox as the app uses it — queue a save,
 * send what is waiting, watch it from the chip. Rules live in `outbox.ts`,
 * storage in `outbox-db.ts`.
 */

const changed = notifyOutboxChanged

const sentListeners = new Set<(entityKey: string, updatedAt: string) => void>()
/** A queued save landed: the version it created is the screen's next base. */
export function onOutboxSent(
  fn: (entityKey: string, updatedAt: string) => void
): () => void {
  sentListeners.add(fn)
  return () => void sentListeners.delete(fn)
}

// Web Locks, across tabs too: "store" for each short read-and-write (a save
// replacing a waiting item never races the replay marking it), "replay" for a
// whole run (one tab sends at a time). The store lock is never held while a
// request is on the wire, so an offline save never waits on the network.
const tails = new Map<string, Promise<unknown>>()
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`acadigma-outbox-${name}`, fn) as Promise<T>
  }
  const run = (tails.get(name) ?? Promise.resolve()).then(fn, fn)
  tails.set(
    name,
    run.catch(() => undefined)
  )
  return run
}
const storeLock = <T>(fn: () => Promise<T>) => withLock("store", fn)

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
  return storeLock(() => enqueue(liveStore(draft.userId), draft))
}

async function send(item: OutboxItem) {
  // `queuedFor`: the action refuses it under any other user or workspace.
  return saveAttendanceSession({
    ...item.payload,
    queuedFor: { userId: item.userId, workspaceId: item.workspaceId },
  })
}

async function runOnce(userId: string): Promise<void> {
  if (!navigator.onLine) return
  // Nothing waiting: no request at all (triggers are frequent and cheap).
  const items = await outboxStore(userId)
    .list()
    .catch(() => [])
  if (!items.some((i) => i.status === "pending" || i.status === "sending")) {
    return
  }
  const { check } = await checkSession()
  if (check.kind !== "signed_in" || check.userId !== userId) return
  const workspaceId = check.workspaceId
  if (!workspaceId) return
  await withLock("replay", () =>
    replay(liveStore(userId), {
      userId,
      workspaceId,
      send,
      lock: storeLock,
      onSent: (item, updatedAt) =>
        sentListeners.forEach((fn) => fn(item.entityKey, updatedAt)),
    })
  )
}

let running: Promise<void> | null = null
let again = false
/**
 * §4.4: send this user's waiting items for the workspace the server says is
 * active now — after the session check (and its purges) confirmed who is
 * here. One run at a time; a trigger that arrives during a run (the `online`
 * event while a request is still failing) gets one more run after it.
 */
export function sendQueued(userId: string): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await runOnce(userId)
    } while (again)
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
  await storeLock(async () => {
    const store = liveStore(userId)
    const item = (await store.list()).find((i) => i.id === id)
    if (item) await store.put({ ...item, status: "pending", lastError: null })
  })
  await sendQueued(userId)
}

/** Delete (§4.10): only ever the user's own choice. */
export function deleteItem(userId: string, id: string): Promise<void> {
  return storeLock(() => liveStore(userId).remove(id))
}

/**
 * What the signed-in user has waiting, for the sign-out question (§4.7).
 * Only their own outbox: another teacher's queue on a shared phone is theirs
 * to send or delete, never counted or wiped by someone else's sign-out.
 */
export async function countQueued(userId: string | null): Promise<number> {
  if (!userId) return 0
  return (await outboxStore(userId).list()).length
}

/** Sign-out (§4.7): the signed-in user's outbox goes with their session. */
export async function deleteOwnOutbox(userId: string | null): Promise<void> {
  if (!userId) return
  await storeLock(() => deleteOutbox(userId))
  changed()
}

/** The user's items, live. */
export function useOutbox(userId: string): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([])
  useEffect(() => {
    let live = true
    // Reads finish out of order; only the latest may set the state, or an
    // older read ("sending") could overwrite a newer one (sent, gone).
    let latest = 0
    const load = () => {
      const n = ++latest
      outboxStore(userId)
        .list()
        .then((next) => {
          if (live && n === latest) {
            setItems(next.sort((a, b) => a.createdAt - b.createdAt))
          }
        })
        .catch(() => undefined)
    }
    load()
    outboxEvents?.addEventListener("change", load)
    return () => {
      live = false
      outboxEvents?.removeEventListener("change", load)
    }
  }, [userId])
  return items
}
