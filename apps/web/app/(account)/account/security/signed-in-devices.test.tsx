import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

const mockRevoke = vi.fn()
const mockEverywhere = vi.fn()
vi.mock("./session-actions", () => ({
  revokeSession: mockRevoke,
  signOutEverywhere: mockEverywhere,
}))
const mockPurge = vi.fn(async () => {})
vi.mock("@/lib/offline/check", () => ({ purgeOnSignOut: mockPurge }))
vi.mock("@/lib/offline/outbox-client", () => ({
  deleteOwnOutbox: vi.fn(async () => {}),
}))

const { SignedInDevices } = await import("./signed-in-devices")

const t = en.auth.devices
const THIS = "0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"
const PHONE = "1b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"
const THIRD = "2b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e"
const devices = [
  {
    id: THIS,
    label: "Chrome on Windows",
    isCurrent: true,
    signedIn: "29 Sept 2026",
    lastActive: "1 Oct 2026",
  },
  {
    id: PHONE,
    label: "Chrome on Android",
    isCurrent: false,
    signedIn: "20 Sept 2026",
    lastActive: "30 Sept 2026",
  },
]

beforeEach(() => {
  mockRevoke.mockReset()
  mockEverywhere.mockReset()
})

function renderList() {
  render(<SignedInDevices t={t} userId="u1" devices={devices} />)
}

describe("SignedInDevices", () => {
  it("marks this device and offers Sign out only on the others", () => {
    renderList()
    expect(screen.getAllByTestId("device-row")).toHaveLength(2)
    expect(screen.getByText(t.thisDevice)).toBeTruthy()
    expect(
      screen.getAllByRole("button", { name: /^Sign out Chrome/ })
    ).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "Sign out Chrome on Android" })
    ).toBeTruthy()
  })

  it("hides a revoked device and says so", async () => {
    mockRevoke.mockResolvedValue({ ok: true, data: { revoked: true } })
    renderList()
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Sign out Chrome on Android" })
      )
    })
    expect(mockRevoke).toHaveBeenCalledWith({ sessionId: PHONE })
    expect(screen.getAllByTestId("device-row")).toHaveLength(1)
    expect(screen.getByText(t.revoked)).toBeTruthy()
  })

  it("puts the device back when the server refuses", async () => {
    mockRevoke.mockResolvedValue({
      ok: false,
      error: { code: "dependency_unavailable", message: "Could not reach" },
    })
    renderList()
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Sign out Chrome on Android" })
      )
    })
    expect(screen.getAllByTestId("device-row")).toHaveLength(2)
    expect(screen.getByText("Could not reach")).toBeTruthy()
  })

  it("moves focus to the next device after one is signed out", async () => {
    mockRevoke.mockResolvedValue({ ok: true, data: { revoked: true } })
    render(
      <SignedInDevices
        t={t}
        userId="u1"
        devices={[
          ...devices,
          { ...devices[1]!, id: THIRD, label: "Safari on iOS" },
        ]}
      />
    )
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Sign out Chrome on Android" })
      )
    })
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Sign out Safari on iOS" })
    )
  })

  it("Sign out everywhere asks first; Cancel does nothing", async () => {
    renderList()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.everywhereButton }))
    })
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(screen.getByText(t.confirmBody)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.confirmCancel }))
    })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(mockEverywhere).not.toHaveBeenCalled()
  })

  it("Sign out everywhere, confirmed, reports a failure and keeps this device's data", async () => {
    mockEverywhere.mockResolvedValue({
      ok: false,
      error: { code: "dependency_unavailable", message: "Try again." },
    })
    renderList()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.everywhereButton }))
    })
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: t.confirmAction,
        })
      )
    })
    expect(mockEverywhere).toHaveBeenCalledTimes(1)
    expect(mockPurge).not.toHaveBeenCalled()
    expect(screen.getByText("Try again.")).toBeTruthy()
  })
})
