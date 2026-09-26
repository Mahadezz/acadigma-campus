import { deleteOutbox, outboxStore, outboxUserIds } from "./outbox-db"
import {
  DATA_CACHE_PREFIX,
  decidePurge,
  type OfflineSnapshot,
  type SessionCheck,
} from "./purge"
import { PURGE_MESSAGE } from "./purge-guard"

/**
 * Browser side of the F-ID-11 Part 1 cache purge (D-308). Every function is
 * safe to call where Cache Storage or localStorage is missing (older
 * browsers, private windows): it simply does nothing there.
 */

/** Non-secret ids only (user, workspace, role) — never a token. */
const SNAPSHOT_KEY = "acadigma-offline-snapshot"

function readSnapshot(): OfflineSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? (JSON.parse(raw) as OfflineSnapshot) : null
  } catch {
    return null
  }
}

function writeSnapshot(next: OfflineSnapshot | null): void {
  try {
    if (next) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next))
    else localStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    // Storage unavailable: no snapshot is ever read back, so every check
    // purges (decidePurge) — safe; the device just keeps nothing offline.
  }
}

/**
 * Asks the worker to purge first: it marks every page write in flight as
 * stale before deleting (`purge-guard.ts`), which the page cannot do. Gives up
 * after 2 s (a busy or dying worker); the page's own delete still runs.
 *
 * Every worker of the registration gets it — installing, waiting and active,
 * not only this page's controller: mid-update a new worker may already be
 * serving fetches, and a first load has no controller at all (#83 re-check).
 */
async function purgeInWorker(): Promise<void> {
  const sw = typeof navigator === "undefined" ? null : navigator.serviceWorker
  if (!sw) return
  const reg = await sw.getRegistration?.().catch(() => undefined)
  const workers = new Set(
    [sw.controller, reg?.installing, reg?.waiting, reg?.active].filter(
      (w): w is ServiceWorker => w != null
    )
  )
  await Promise.all(
    [...workers].map(
      (worker) =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel()
          channel.port1.onmessage = () => resolve()
          setTimeout(resolve, 2000)
          worker.postMessage({ type: PURGE_MESSAGE }, [channel.port2])
        })
    )
  )
}

/** Deletes every `acadigma-data-*` cache, through the worker first. */
export async function purgeDataCaches(): Promise<void> {
  await purgeInWorker()
  if (typeof caches === "undefined") return
  const names = await caches.keys()
  await Promise.all(
    names
      .filter((name) => name.startsWith(DATA_CACHE_PREFIX))
      .map((name) => caches.delete(name))
  )
}

/** Sign-out (§4.7): wipe the cache and forget who was here. */
export async function purgeOnSignOut(): Promise<void> {
  writeSnapshot(null)
  await purgeDataCaches().catch(() => undefined)
}

const CLOCK_KEY = "acadigma-clock-offset"

/** Server clock minus this device's, from a response's `Date` header. */
function rememberServerClock(date: string | null): void {
  const server = date ? Date.parse(date) : NaN
  if (Number.isNaN(server)) return
  try {
    localStorage.setItem(CLOCK_KEY, String(server - Date.now()))
  } catch {
    // No storage: "Last updated" falls back to the device clock.
  }
}

/**
 * How far the server's clock is ahead of this device's (ms; 0 if unknown), so
 * "Last updated" compares a server render time with server time — a phone
 * whose clock is off would otherwise stamp a fresh page or miss a stale one.
 */
export function serverClockOffset(): number {
  try {
    return Number(localStorage.getItem(CLOCK_KEY)) || 0
  } catch {
    return 0
  }
}

async function fetchSessionCheck(): Promise<SessionCheck> {
  try {
    const res = await fetch("/api/offline/session", { cache: "no-store" })
    rememberServerClock(res.headers.get("date"))
    if (!res.ok) return { kind: "unknown" }
    return (await res.json()) as SessionCheck
  } catch {
    return { kind: "unknown" }
  }
}

/**
 * §4.8: asks the server who is signed in here, in which workspace and with
 * which role, and wipes the page cache if any of that changed since the last
 * check. Returns whether it purged.
 *
 * `switchedTo`: the workspace switcher has just wiped every cache itself. If
 * the check confirms that workspace, the change is the switch, and a second
 * wipe would only throw away the new workspace's first page (#83 re-check).
 */
export async function runOfflineCheck(
  opts: { switchedTo?: string } = {}
): Promise<boolean> {
  return (await checkSession(opts)).purged
}

/**
 * §4.8, the outbox half (D-309), kept apart from the page wipe: another
 * user's outbox on this device is deleted (a different user never sends or
 * sees it), and this user's items for a workspace they are no longer an
 * active member of are deleted. A role change keeps them — they replay under
 * the new role, where the server decides. Signed out keeps everything: an
 * expired session resumes for the same user (§4.6).
 */
async function purgeOutboxes(
  check: Extract<SessionCheck, { kind: "signed_in" }>
): Promise<void> {
  if (typeof indexedDB === "undefined") return
  const users = await outboxUserIds()
  for (const id of users ?? []) {
    if (id !== check.userId) await deleteOutbox(id)
  }
  // No outbox of theirs here: nothing to open (opening would create one).
  if (users && !users.includes(check.userId)) return
  const store = outboxStore(check.userId)
  for (const item of await store.list()) {
    if (!check.activeWorkspaceIds.includes(item.workspaceId)) {
      await store.remove(item.id)
    }
  }
}

/** The check and both purges; what replay needs to know who may send. */
export async function checkSession(
  opts: { switchedTo?: string } = {}
): Promise<{ purged: boolean; check: SessionCheck }> {
  const check = await fetchSessionCheck()
  if (check.kind === "signed_in") {
    await purgeOutboxes(check).catch(() => undefined)
  }
  const decision = decidePurge(readSnapshot(), check)
  if (
    opts.switchedTo &&
    check.kind === "signed_in" &&
    check.workspaceId === opts.switchedTo
  ) {
    decision.purge = false
  }
  if (decision.purge) await purgeDataCaches().catch(() => undefined)
  if (decision.next !== undefined) writeSnapshot(decision.next)
  return { purged: decision.purge, check }
}

/** When the last check stored a user, or a data cache exists, there is something to guard. */
export async function hasOfflineState(): Promise<boolean> {
  if (readSnapshot()) return true
  if (typeof caches === "undefined") return false
  const names = await caches.keys().catch(() => [] as string[])
  return names.some((name) => name.startsWith(DATA_CACHE_PREFIX))
}

/**
 * Keeps the page a user reached by a client-side navigation readable offline.
 * The worker caches full page loads by itself; Next's in-app navigations fetch
 * RSC payloads instead, which are not cached (F-ID-11 OQ-3), so the page's HTML
 * is fetched once in the background with `CACHE_PAGE_HEADER`, and the worker
 * stores it exactly as it stores a navigation (same cache, same expiry, never
 * a redirect).
 *
 * ponytail: one extra page render per in-app navigation, at most once per URL
 * every 10 minutes. Replace with the warm-up list (§4.2) if server load or a
 * teacher's data bundle shows it.
 */
export const CACHE_PAGE_HEADER = "x-acadigma-cache-page"
const lastCached = new Map<string, number>()
const RECACHE_MS = 10 * 60_000

export function cachePageForOffline(url: string): void {
  if (!navigator.serviceWorker?.controller || !navigator.onLine) return
  const now = Date.now()
  if (now - (lastCached.get(url) ?? 0) < RECACHE_MS) return
  lastCached.set(url, now)
  void fetch(url, {
    credentials: "same-origin",
    headers: { [CACHE_PAGE_HEADER]: "1" },
  }).catch(() => undefined)
}
