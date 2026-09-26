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
    const { plugin } = createPurgeGuard()
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    const response = ok()
    expect(
      await call(plugin.cacheWillUpdate)({ request, response, state })
    ).toBe(response)
  })

  it("drops a response whose request started before a purge", async () => {
    const { plugin, purged } = createPurgeGuard()
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    purged()
    expect(
      await call(plugin.cacheWillUpdate)({ request, response: ok(), state })
    ).toBeNull()
  })

  it("never stores a redirect or a non-200", async () => {
    const { plugin } = createPurgeGuard()
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
    const { plugin, purged } = createPurgeGuard()
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
    const { plugin } = createPurgeGuard()
    const state = {}
    await call(plugin.handlerWillStart)({ request, state })
    await call(plugin.cacheDidUpdate)({
      cacheName: "acadigma-data-pages",
      request,
      state,
    })
    expect(del).not.toHaveBeenCalled()
  })
})
