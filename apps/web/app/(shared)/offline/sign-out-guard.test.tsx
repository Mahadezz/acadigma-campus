import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

// FormSheet picks Sheet vs Dialog with matchMedia; jsdom has none.
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}))

/**
 * F-ID-11 §4.7 (D-310, review of #89): the sign-out guard counts and deletes
 * the outbox of the user the SERVER says is signed in, not the device's last
 * snapshot — which can name someone else when a check never got through.
 */

const countQueued = vi.fn(async (_userId: string | null) => 0)
const deleteOwnOutbox = vi.fn(async (_userId: string | null) => undefined)
vi.mock("@/lib/offline/outbox-client", () => ({
  countQueued: (id: string | null) => countQueued(id),
  deleteOwnOutbox: (id: string | null) => deleteOwnOutbox(id),
  sendQueued: vi.fn(),
}))
vi.mock("@/lib/offline/check", () => ({
  purgeOnSignOut: async () => undefined,
}))
vi.mock("./offline-provider", () => ({
  useOfflineCopy: () => () => en.offline,
}))

const { GuardedSignOutButton } = await import("./sign-out-guard")

beforeEach(() => vi.clearAllMocks())

describe("useGuardedSignOut", () => {
  it("deletes the signed-in user's outbox, never the snapshot's", async () => {
    const signOutNow = vi.fn(async () => undefined)
    render(
      <GuardedSignOutButton userId="me" signOutNow={signOutNow}>
        Sign out
      </GuardedSignOutButton>
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    })
    expect(countQueued).toHaveBeenCalledWith("me")
    expect(deleteOwnOutbox).toHaveBeenCalledWith("me")
    expect(deleteOwnOutbox).not.toHaveBeenCalledWith("previous-user")
    expect(signOutNow).toHaveBeenCalled()
  })

  it("asks first when the signed-in user has changes waiting", async () => {
    countQueued.mockResolvedValueOnce(2)
    const signOutNow = vi.fn(async () => undefined)
    render(
      <GuardedSignOutButton userId="me" signOutNow={signOutNow}>
        Sign out
      </GuardedSignOutButton>
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    })
    expect(
      await screen.findByText(en.offline.signOutTitle.replace("{count}", "2"))
    ).toBeTruthy()
    expect(signOutNow).not.toHaveBeenCalled()
    expect(deleteOwnOutbox).not.toHaveBeenCalled()
  })
})
