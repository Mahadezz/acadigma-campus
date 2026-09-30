import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

import { DisplaySettingsForm } from "./display-settings-form"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

const mockUpdate = vi.fn()
const mockToastError = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({
  toast: { error: (m: string) => mockToastError(m) },
}))
vi.mock("@/app/(shared)/workspace/actions", () => ({
  updateUiPreferences: (...a: unknown[]) => mockUpdate(...a),
}))

const t = en.basicMode.settings

function renderForm() {
  return render(
    <DisplaySettingsForm
      textSize="normal"
      uiMode="full"
      showBasicModeSwitch={false}
      t={t}
    />
  )
}

// D-409: the text-size choice is optimistic, and rolls back with a toast.
describe("DisplaySettingsForm optimistic text size", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows the new size before the server answers", async () => {
    let resolve!: (v: unknown) => void
    mockUpdate.mockReturnValue(new Promise((r) => (resolve = r)))
    renderForm()
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(t.large) }))
    await waitFor(() =>
      expect(
        screen
          .getByRole("radio", { name: new RegExp(t.large) })
          .getAttribute("aria-checked")
      ).toBe("true")
    )
    resolve({ ok: true, data: {} })
  })

  it("rolls back and toasts when the save fails", async () => {
    mockUpdate.mockResolvedValue({ ok: false, error: { code: "x" } })
    renderForm()
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(t.large) }))
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(t.saveError)
    )
    await waitFor(() =>
      expect(
        screen
          .getByRole("radio", { name: new RegExp(t.normal) })
          .getAttribute("aria-checked")
      ).toBe("true")
    )
  })
})
