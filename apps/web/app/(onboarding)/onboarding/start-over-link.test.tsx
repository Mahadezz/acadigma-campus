import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mockSaveOnboardingDraft = vi.fn()
vi.mock("../actions", () => ({
  saveOnboardingDraft: mockSaveOnboardingDraft,
}))

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}))

const { StartOverLink } = await import("./start-over-link")

/**
 * The silent-failure fix (Opus review, PR #24): `!result.ok` used to just
 * `return`, leaving the user staring at a button that visibly did nothing.
 * Mirrors `TutoringExitLink`'s already-proven pattern exactly.
 */
describe("StartOverLink", () => {
  it("shows the error alert and a retry label when saveOnboardingDraft fails, instead of failing silently", async () => {
    mockSaveOnboardingDraft.mockResolvedValueOnce({
      ok: false,
      error: { code: "dependency_unavailable", message: "boom" },
    })

    render(
      <StartOverLink
        label="Start over"
        errorLabel="Something went wrong. Try again."
      />
    )

    await act(async () => {
      screen.getByRole("button", { name: "Start over" }).click()
    })

    expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: /start over — retry/i })
    ).toBeTruthy()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("refreshes and shows no error on success", async () => {
    mockSaveOnboardingDraft.mockResolvedValueOnce({ ok: true, data: {} })

    render(
      <StartOverLink
        label="Start over"
        errorLabel="Something went wrong. Try again."
      />
    )

    await act(async () => {
      screen.getByRole("button", { name: "Start over" }).click()
    })

    expect(screen.queryByText("Something went wrong. Try again.")).toBeNull()
    expect(mockRefresh).toHaveBeenCalledOnce()
  })
})
