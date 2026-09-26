import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist"

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    /** Injected at build time by @serwist/next. */
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/**
 * Service worker (ARCHITECTURE §6, F-ID-11 Part 1, D-308).
 *
 * Caches the app shell (precache) and the signed-in pages a user opened, so a
 * teacher who loses signal still sees her classes. Pages are network-first:
 * the cache is only a fallback, never preferred over a live answer.
 *
 * Every cache holding user data is named `acadigma-data-*`. The page purges
 * those (`lib/offline`) on sign-out, sign-in, workspace switch, revocation and
 * role change — cache keys are URLs, which carry neither the user nor the
 * workspace. Nothing else here may cache a response that carries user data:
 * `/api/*` (signed file URLs, PDFs), RSC payloads, auth pages, `/account` and
 * `/platform` are network-only.
 *
 * Queued writes are *not* handled here (F-ID-11 Part 2a): they go to IndexedDB
 * and replay through the normal Server Action with an idempotency key.
 */
const DATA_PAGES = "acadigma-data-pages"

/** Only the signed-in shells are cached. */
const CACHED_SHELLS = /^\/(app|family|personal)(\/|$)/

/**
 * Caches the previous worker (serwist's `defaultCache`) filled with pages and
 * `/api` responses — user data under names the purge does not know. Dropped
 * once, when this worker activates.
 */
const LEGACY_CACHES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "apis",
  "cross-origin",
  "next-data",
  "static-data-assets",
  "start-url",
]

/**
 * Cache only a plain 200 from the page itself. A redirect (e.g. an expired
 * session bounced to /login) would otherwise be stored under the page's URL.
 */
const okOnly = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 && !response.redirected ? response : null,
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A stale shell against a new API is worse than one reload.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin &&
        // A navigation, or the page's own background copy of a page it
        // reached by an in-app navigation (`cachePageForOffline`).
        (request.mode === "navigate" ||
          request.headers.get("x-acadigma-cache-page") === "1") &&
        CACHED_SHELLS.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: DATA_PAGES,
        // Next varies pages on router headers a plain navigation never sends.
        matchOptions: { ignoreVary: true },
        plugins: [
          okOnly,
          // ponytail: an entry count, not the spec's 50 MB byte cap (§5.6); a
          // page is ~100-300 KB, so 60 stays well under it. Byte-accurate
          // eviction when Part 5 adds the quota check.
          new ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      // Build output is content-hashed: safe to keep, holds no user data.
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "acadigma-static",
        plugins: [new ExpirationPlugin({ maxEntries: 200 })],
      }),
    },
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin &&
        !url.pathname.startsWith("/api/") &&
        /\.(?:png|svg|ico|webp|woff2?)$/i.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "acadigma-static-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 64 })],
      }),
    },
    // Everything else — RSC payloads, /api, auth, /platform, cross-origin — is
    // never cached. An RSC fetch that fails offline makes Next fall back to a
    // full navigation, which the page cache above answers (F-ID-11 OQ-3).
    { matcher: () => true, handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
})

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all(LEGACY_CACHES.map((name) => caches.delete(name))))
})

serwist.addEventListeners()
