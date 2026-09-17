import { defaultCache } from "@serwist/next/worker"
import { Serwist } from "serwist"

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    /** Injected at build time by @serwist/next. */
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/**
 * Service worker (ARCHITECTURE §6).
 *
 * Caches the app shell so a teacher with two bars of signal still gets a screen.
 * Queued attendance writes are *not* handled here — they go to IndexedDB and replay
 * through the normal Server Action with an idempotency key, which is the only way
 * the server can safely dedupe them (ARCHITECTURE §5).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A stale shell against a new API is worse than one reload.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
})

serwist.addEventListeners()
