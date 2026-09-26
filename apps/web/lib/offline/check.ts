import {
  DATA_CACHE_PREFIX,
  decidePurge,
  type OfflineSnapshot,
  type SessionCheck,
} from "./purge"

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
    // Storage unavailable: the next check simply purges again.
  }
}

/** Deletes every `acadigma-data-*` cache. */
export async function purgeDataCaches(): Promise<void> {
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

async function fetchSessionCheck(): Promise<SessionCheck> {
  try {
    const res = await fetch("/api/offline/session", { cache: "no-store" })
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
 */
export async function runOfflineCheck(): Promise<boolean> {
  const decision = decidePurge(readSnapshot(), await fetchSessionCheck())
  if (decision.purge) await purgeDataCaches().catch(() => undefined)
  if (decision.next !== undefined) writeSnapshot(decision.next)
  return decision.purge
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
