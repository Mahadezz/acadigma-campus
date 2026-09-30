import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

// FormSheet picks Sheet vs Dialog with matchMedia; jsdom has none.
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}))

const mockRequest = vi.fn()
vi.mock("./actions", () => ({ requestAccountDeletion: mockRequest }))

const mockSwitch = vi.fn(async () => ({ ok: true, data: {} }))
vi.mock("@/app/(shared)/workspace/actions", () => ({
  switchWorkspace: mockSwitch,
}))

vi.mock("@/lib/offline/check", () => ({
  purgeOnSignOut: vi.fn(async () => {}),
}))
vi.mock("@/lib/offline/outbox-client", () => ({
  deleteOwnOutbox: vi.fn(async () => {}),
}))

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}))

const { DeleteAccount } = await import("./delete-account")

const t = en.auth.deleteAccount
const WS = "1c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

beforeEach(() => {
  mockRequest.mockReset()
  mockPush.mockReset()
})

describe("DeleteAccount", () => {
  it("blocked: lists the school and hands over through Your membership", async () => {
    render(
      <DeleteAccount
        t={t}
        userId="u1"
        graceDays={30}
        blockers={[{ workspaceId: WS, name: "Solo School" }]}
      />
    )
    expect(screen.getByText("Solo School")).toBeTruthy()
    expect(screen.queryByRole("button", { name: t.openButton })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.transferButton }))
    })
    expect(mockSwitch).toHaveBeenCalledWith({ workspaceId: WS })
    expect(mockPush).toHaveBeenCalledWith("/app/settings/membership")
  })

  it("ceremony: explains first, then needs DELETE and a password", async () => {
    render(<DeleteAccount t={t} userId="u1" graceDays={30} blockers={[]} />)
    fireEvent.click(screen.getByRole("button", { name: t.openButton }))
    expect(screen.getByText(t.keptTitle)).toBeTruthy()
    expect(screen.getByText("Removed after 30 days")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: t.continueButton }))
    const submit = screen.getByRole("button", { name: t.submitButton })
    expect((submit as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(t.confirmLabel), {
      target: { value: "delete" },
    })
    fireEvent.change(screen.getByLabelText(t.passwordLabel), {
      target: { value: "pw" },
    })
    expect((submit as HTMLButtonElement).disabled).toBe(true) // case matters

    fireEvent.change(screen.getByLabelText(t.confirmLabel), {
      target: { value: "DELETE" },
    })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows the server's refusal and stays on the sheet", async () => {
    mockRequest.mockResolvedValue({
      ok: false,
      error: {
        code: "unauthenticated",
        message: "That password is not correct.",
      },
    })
    render(<DeleteAccount t={t} userId="u1" graceDays={30} blockers={[]} />)
    fireEvent.click(screen.getByRole("button", { name: t.openButton }))
    fireEvent.click(screen.getByRole("button", { name: t.continueButton }))
    fireEvent.change(screen.getByLabelText(t.confirmLabel), {
      target: { value: "DELETE" },
    })
    fireEvent.change(screen.getByLabelText(t.passwordLabel), {
      target: { value: "wrong" },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.submitButton }))
    })
    expect(mockRequest).toHaveBeenCalledWith({
      confirmation: "DELETE",
      password: "wrong",
    })
    expect(screen.getByText("That password is not correct.")).toBeTruthy()
  })
})
