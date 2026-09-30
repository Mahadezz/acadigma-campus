import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

import { AcceptForm } from "./accept-form"

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

const mockAccept = vi.fn()
const mockReplace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}))
vi.mock("./actions", () => ({
  acceptLegalDocuments: (...a: unknown[]) => mockAccept(...a),
}))

const t = {
  ...en.auth.reaccept,
  termsLabel: en.auth.register.termsLabel,
  termsLink: en.auth.register.termsLink,
  privacyLink: en.auth.register.privacyLink,
  dpaLabel: en.onboarding.wizard.dpaLabel,
  dpaLink: en.onboarding.wizard.dpaLink,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AcceptForm (D-115)", () => {
  it("shows only the DPA box when only the DPA is outstanding", () => {
    render(<AcceptForm versions={{ dpa: "v1" }} t={t} />)
    expect(screen.getAllByRole("checkbox")).toHaveLength(1)
    expect(
      screen
        .getByRole("link", { name: "Data Processing Agreement" })
        .getAttribute("href")
    ).toBe("/legal/dpa")
  })

  it("says why and sends nothing while a box is unticked", () => {
    render(
      <AcceptForm versions={{ terms: "v1", privacy: "v2", dpa: "v3" }} t={t} />
    )
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(screen.getByText(t.termsRequired)).toBeTruthy()
    expect(screen.getByText(t.dpaRequired)).toBeTruthy()
    expect(mockAccept).not.toHaveBeenCalled()
  })

  it("sends exactly the versions shown, then opens the app", async () => {
    mockAccept.mockResolvedValue({ ok: true, data: { redirectTo: "/app" } })
    const versions = { terms: "v1", privacy: "v2", dpa: "v3" }
    render(<AcceptForm versions={versions} t={t} />)
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box)
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/app"))
    expect(mockAccept).toHaveBeenCalledWith(versions)
  })

  it("shows the server's reason when the documents changed", async () => {
    mockAccept.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict",
        message: "The documents changed. Reload the page.",
      },
    })
    render(<AcceptForm versions={{ terms: "v1", privacy: "v2" }} t={t} />)
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(
      await screen.findByText("The documents changed. Reload the page.")
    ).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
