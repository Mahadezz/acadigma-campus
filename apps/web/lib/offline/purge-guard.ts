import type { SerwistPlugin } from "serwist"

/** What the page posts to the worker to purge (`check.ts` → `app/sw.ts`). */
export const PURGE_MESSAGE = "acadigma-purge"

/**
 * F-ID-11 §4.8 (D-308, security review): serwist stores a page after the
 * response, inside `waitUntil`, so a copy whose request began before a purge
 * could land after it — a signed-out user's or the old workspace's page back
 * in the cache. Each request records the purge epoch when it starts; a write
 * from an older epoch is refused, and one that was already under way when the
 * purge ran is deleted as soon as it lands.
 *
 * Also the only-a-plain-200 rule: a redirect (an expired session bounced to
 * /login) must never be stored under the page's URL.
 */
export function createPurgeGuard(): {
  plugin: SerwistPlugin
  /** Call when the caches are purged: every request in flight is now stale. */
  purged: () => void
} {
  let epoch = 0
  const plugin: SerwistPlugin = {
    handlerWillStart: async ({ state }) => {
      if (state) state.epoch = epoch
    },
    cacheWillUpdate: async ({ response, state }) =>
      state?.epoch === epoch && response.status === 200 && !response.redirected
        ? response
        : null,
    cacheDidUpdate: async ({ cacheName, request, state }) => {
      if (state?.epoch !== epoch) {
        await (await caches.open(cacheName)).delete(request)
      }
    },
  }
  return {
    plugin,
    purged: () => {
      epoch += 1
    },
  }
}
