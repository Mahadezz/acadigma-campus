import type { OutboxItem, OutboxStore } from "./outbox"

/**
 * F-ID-11 §3 (D-309): where the outbox lives — one IndexedDB database per
 * user, `acadigma-<user_id>`, store `outbox`. The native API with a few lines
 * of promise glue; no dependency. Each call opens and closes its connection,
 * so deleting a database (sign-out, purge) is never blocked by an open one.
 */

const PREFIX = "acadigma-"
const USER_DB = /^acadigma-([0-9a-f-]{36})$/
const STORE = "outbox"

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function open(userId: string): Promise<IDBDatabase> {
  const req = indexedDB.open(PREFIX + userId, 1)
  req.onupgradeneeded = () => {
    req.result.createObjectStore(STORE, { keyPath: "id" })
  }
  return done(req)
}

async function run<T>(
  userId: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open(userId)
  try {
    const tx = db.transaction(STORE, mode)
    // Written only once the transaction commits, not when the request succeeds.
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    const result = await done(op(tx.objectStore(STORE)))
    await committed
    return result
  } finally {
    db.close()
  }
}

/** The outbox of one user. */
export function outboxStore(userId: string): OutboxStore {
  return {
    list: () =>
      run(userId, "readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>),
    put: async (item) => {
      await run(userId, "readwrite", (s) => s.put(item))
    },
    remove: async (id) => {
      await run(userId, "readwrite", (s) => s.delete(id))
    },
  }
}

/** Users with an outbox on this device; `null` where the browser cannot list databases. */
export async function outboxUserIds(): Promise<string[] | null> {
  if (typeof indexedDB === "undefined" || !indexedDB.databases) return null
  const dbs = await indexedDB.databases().catch(() => [])
  return dbs.flatMap((d) => USER_DB.exec(d.name ?? "")?.[1] ?? [])
}

/** Deletes one user's whole outbox database. */
export function deleteOutbox(userId: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(PREFIX + userId)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
  })
}
