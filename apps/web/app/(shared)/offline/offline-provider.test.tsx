import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let pathname = "/app/classes"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))

const { OfflineProvider } = await import("./offline-provider")

/**
 * F-ID-11 §4.7 / §4.8 (D-308): the purge the provider runs on its own —
 * arriving at /login wipes without asking the server, and entering a shell
 * from outside it (sign-in, invite, new school) re-checks who is here.
 */

const copy = {
  banner: "offline",
  lastUpdated: "Last updated {time}",
  today: "today",
  needsInternet: "Needs internet",
  needsInternetHint: "hint",
}

let store: Set<string>
const fetchMock = vi.fn()

beforeEach(() => {
  store = new Set(["acadigma-data-pages", "acadigma-static"])
  vi.stubGlobal("caches", {
    keys: async () => [...store],
    delete: async (name: string) => store.delete(name),
  })
  fetchMock.mockReset()
  // The session check can't get through: only an unconditional wipe helps.
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe("OfflineProvider purge", () => {
  it("wipes every data cache on arriving at /login, even with the check failing", async () => {
    pathname = "/app/classes"
    const view = render(<OfflineProvider copy={copy}>x</OfflineProvider>)
    pathname = "/login"
    view.rerender(<OfflineProvider copy={copy}>x</OfflineProvider>)
    await waitFor(() => expect([...store]).toEqual(["acadigma-static"]))
  })

  it("checks the session on entering a shell from outside it", async () => {
    pathname = "/invite"
    const view = render(<OfflineProvider copy={copy}>x</OfflineProvider>)
    fetchMock.mockClear()
    pathname = "/app"
    view.rerender(<OfflineProvider copy={copy}>x</OfflineProvider>)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/offline/session",
        expect.anything()
      )
    )
  })
})
