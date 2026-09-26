import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { purgeDataCaches, purgeOnSignOut, runOfflineCheck } from "./check"

import type { OfflineSnapshot, SessionCheck } from "./purge"

/**
 * F-ID-11 §4.7 / §4.8 / §5.8 (D-308): the browser half of the purge, against
 * a fake Cache Storage. The pages cached here hold children's data, so these
 * prove that sign-out and a workspace switch leave no `acadigma-data-*` cache
 * — even when the session check cannot reach the server.
 */

const TEACHER: OfflineSnapshot = {
  userId: "u1",
  workspaceId: "w1",
  role: "teacher",
}

let store: Set<string>

function respond(check: SessionCheck | "network-error") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (check === "network-error") throw new TypeError("Failed to fetch")
      return new Response(JSON.stringify(check), { status: 200 })
    })
  )
}

beforeEach(() => {
  store = new Set([
    "acadigma-data-pages",
    "acadigma-static",
    "serwist-precache-v2",
  ])
  vi.stubGlobal("caches", {
    keys: async () => [...store],
    delete: async (name: string) => store.delete(name),
  })
  localStorage.setItem("acadigma-offline-snapshot", JSON.stringify(TEACHER))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const left = () => [...store].sort()

describe("offline cache purge (browser side)", () => {
  it("sign-out wipes every data cache and forgets the user, keeping the static shell", async () => {
    await purgeOnSignOut()
    expect(left()).toEqual(["acadigma-static", "serwist-precache-v2"])
    expect(localStorage.getItem("acadigma-offline-snapshot")).toBeNull()
  })

  it("a workspace switch wipes the pages even when the check cannot reach the server", async () => {
    // What the workspace switcher runs: the wipe does not wait on the network.
    respond("network-error")
    await purgeDataCaches()
    await runOfflineCheck()
    expect(left()).not.toContain("acadigma-data-pages")
    // The old workspace stays remembered, so the next check that gets
    // through wipes again whatever was cached in between.
    expect(
      JSON.parse(localStorage.getItem("acadigma-offline-snapshot")!)
    ).toEqual(TEACHER)
  })

  it("the check wipes the pages when the workspace changed and remembers the new one", async () => {
    const next = { ...TEACHER, workspaceId: "w2" }
    respond({ kind: "signed_in", ...next })
    expect(await runOfflineCheck()).toBe(true)
    expect(left()).not.toContain("acadigma-data-pages")
    expect(
      JSON.parse(localStorage.getItem("acadigma-offline-snapshot")!)
    ).toEqual(next)
  })

  it("the check wipes the pages when another user is signed in", async () => {
    respond({ kind: "signed_in", ...TEACHER, userId: "u2" })
    expect(await runOfflineCheck()).toBe(true)
    expect(left()).not.toContain("acadigma-data-pages")
  })

  it("the check wipes the pages when the session is gone", async () => {
    respond({ kind: "signed_out" })
    expect(await runOfflineCheck()).toBe(true)
    expect(left()).not.toContain("acadigma-data-pages")
    expect(localStorage.getItem("acadigma-offline-snapshot")).toBeNull()
  })

  it("keeps the pages when the same user and workspace come back", async () => {
    respond({ kind: "signed_in", ...TEACHER })
    expect(await runOfflineCheck()).toBe(false)
    expect(left()).toContain("acadigma-data-pages")
  })
})
