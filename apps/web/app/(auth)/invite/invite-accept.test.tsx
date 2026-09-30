import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

/**
 * D-114 (legal audit item 5): the accept screen shows the parent the consent
 * text, with the school and child named, and accepts only once they tick
 * "I agree" — the server records that exact text's version and language.
 */
const previewInvitation = vi.fn()
const acceptInvitation = vi.fn()

vi.mock("./actions", () => ({
  previewInvitation: (...a: unknown[]) => previewInvitation(...a),
  acceptInvitation: (...a: unknown[]) => acceptInvitation(...a),
}))
vi.mock("../actions", () => ({ signOut: vi.fn() }))
vi.mock("@/app/(shared)/offline/online-only", () => ({
  OnlineOnly: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("@/app/(shared)/offline/sign-out-guard", () => ({
  useGuardedSignOut: () => ({ request: vi.fn(), pending: false, dialog: null }),
}))

const { InviteAccept } = await import("./invite-accept")

const TOKEN = "a".repeat(64)

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, "", `/invite#${TOKEN}`)
  previewInvitation.mockResolvedValue({
    ok: true,
    data: {
      status: "pending",
      schoolName: "Ideal School",
      studentName: "Rafi Ahmed",
      studentNameBn: null,
      relation: "mother",
      expiresAt: "2026-10-07T00:00:00Z",
    },
  })
  acceptInvitation.mockResolvedValue({
    ok: false,
    error: { code: "internal", message: "stop here" },
  })
})

async function renderPreview() {
  await act(async () => {
    render(
      <InviteAccept
        t={en.invite}
        relations={en.students.relation}
        locale="en"
        userId="u1"
      />
    )
  })
}

describe("InviteAccept — guardian consent (D-114)", () => {
  it("shows the consent text with the school and child filled in", async () => {
    await renderPreview()
    expect(
      screen.getByRole("heading", { name: en.invite.consentHeading })
    ).toBeTruthy()
    expect(
      screen.getByText(
        "I agree that Ideal School uses Acadigma Campus to share Rafi Ahmed's school records, such as results and report cards, with me in this app."
      )
    ).toBeTruthy()
  })

  it("does not accept until the parent ticks I agree", async () => {
    await renderPreview()
    await act(async () => {
      screen.getByRole("button", { name: en.invite.accept }).click()
    })
    expect(screen.getByRole("alert").textContent).toBe(
      en.invite.consentRequired
    )
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it("accepts with consent once the box is ticked", async () => {
    await renderPreview()
    await act(async () => {
      screen.getByRole("checkbox", { name: en.invite.consentCheckbox }).click()
    })
    await act(async () => {
      screen.getByRole("button", { name: en.invite.accept }).click()
    })
    expect(acceptInvitation).toHaveBeenCalledWith({
      token: TOKEN,
      consent: true,
      locale: "en",
    })
  })
})
