import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PULL_THRESHOLD, PullToRefresh } from "./pull-to-refresh"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

function coarse(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches }))
}
function drag(to: number, target: Element = document.body) {
  fireEvent.touchStart(target, { touches: [{ clientY: 0 }] })
  fireEvent.touchMove(target, { touches: [{ clientY: to }] })
  fireEvent.touchEnd(target)
}

describe("PullToRefresh", () => {
  beforeEach(() => {
    refresh.mockClear()
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true })
    coarse(true)
  })
  afterEach(() => vi.unstubAllGlobals())

  const mount = () =>
    render(<PullToRefresh label="Refresh" refreshingLabel="Refreshing" />)

  it("refreshes after a pull past the threshold at the top", () => {
    mount()
    act(() => drag(PULL_THRESHOLD * 2 + 2))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("ignores a short pull", () => {
    mount()
    act(() => drag(PULL_THRESHOLD))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("ignores a pull when the page is scrolled", () => {
    Object.defineProperty(window, "scrollY", { value: 200, configurable: true })
    mount()
    act(() => drag(400))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("ignores a pull while a dialog is open", () => {
    const dlg = document.createElement("div")
    dlg.setAttribute("role", "dialog")
    document.body.append(dlg)
    mount()
    act(() => drag(400))
    dlg.remove()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("does nothing on a fine pointer (desktop)", () => {
    coarse(false)
    mount()
    act(() => drag(400))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("has a keyboard refresh button", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
