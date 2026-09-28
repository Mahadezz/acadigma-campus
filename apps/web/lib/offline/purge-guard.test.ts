import { afterEach, describe, expect, it, vi } from "vitest"

import { createPurgeGuard } from "./purge-guard"

/**
 * Security review MEDIUM 2 (D-308): serwist writes a page into the cache after
 * the response, inside `waitUntil`, so a copy fetched before a purge can land
 * after it. The guard drops (or deletes) any write that started before the
 * latest purge.
 */

const request = new Request("https://campus.test/app/classes")
const ok = () => new Response("roster", { status: 200 })
const call = <T>(fn: T) =>
  fn as unknown as (p: Record<string, unknown>) => Promise<unknown>

afterEach(() => vi.unstubAllGlobals())

describe("createPurgeGuard", () => {
  it("stores a plain 200 when no purge happened during the request", async () => {
    const { plugin } = createPurgeGuard("acadigma-data-pages")
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    const response = ok()
    expect(
      await call(plugin.cacheWillUpdate)({ request, response, state })
    ).toBe(response)
  })

  it("drops a response whose request started before a purge", async () => {
    const { plugin, purged } = createPurgeGuard("acadigma-data-pages")
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    purged()
    expect(
      await call(plugin.cacheWillUpdate)({ request, response: ok(), state })
    ).toBeNull()
  })

  it("never stores a redirect or a non-200", async () => {
    const { plugin } = createPurgeGuard("acadigma-data-pages")
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    const redirected = ok()
    Object.defineProperty(redirected, "redirected", { value: true })
    expect(
      await call(plugin.cacheWillUpdate)({
        request,
        response: redirected,
        state,
      })
    ).toBeNull()
    expect(
      await call(plugin.cacheWillUpdate)({
        request,
        response: new Response("", { status: 500 }),
        state,
      })
    ).toBeNull()
  })

  it("deletes an entry whose write finished after a purge that began mid-write", async () => {
    const del = vi.fn(async () => true)
    vi.stubGlobal("caches", { open: async () => ({ delete: del }) })
    const { plugin, purged } = createPurgeGuard("acadigma-data-pages")
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    await call(plugin.cacheWillUpdate)({ request, response: ok(), state })
    purged()
    await call(plugin.cacheDidUpdate)({
      cacheName: "acadigma-data-pages",
      request,
      state,
    })
    expect(del).toHaveBeenCalledWith(request)
  })

  it("leaves an entry written with no purge in between", async () => {
    const del = vi.fn(async () => true)
    vi.stubGlobal("caches", { open: async () => ({ delete: del }) })
    const { plugin } = createPurgeGuard("acadigma-data-pages")
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    await call(plugin.cacheDidUpdate)({
      cacheName: "acadigma-data-pages",
      request,
      state,
    })
    expect(del).not.toHaveBeenCalled()
  })
  it("deletes the cached copy of a page the server now refuses (403 / 404)", async () => {
    // #85 review: a revoked guardian link or a removed record — the page must
    // not stay readable offline from an older copy.
    const del = vi.fn(async () => true)
    vi.stubGlobal("caches", { open: async () => ({ delete: del }) })
    const { plugin } = createPurgeGuard("acadigma-data-pages")
    for (const status of [403, 404]) {
      const response = new Response("", { status })
      expect(
        await call(plugin.cacheWillUpdate)({ request, response, state: {} })
      ).toBeNull()
    }
    expect(del).toHaveBeenCalledTimes(2)
    await call(plugin.cacheWillUpdate)({ request, response: ok(), state: {} })
    expect(del).toHaveBeenCalledTimes(2)
  })
})
