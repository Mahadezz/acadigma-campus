import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mockUpdateLocale = vi.fn(async () => ({
  ok: true,
  data: { locale: "bn" },
}))
vi.mock("./actions", () => ({
  updateLocale: mockUpdateLocale,
}))

const mockSignOut = vi.fn(async () => undefined)
vi.mock("@/app/(auth)/actions", () => ({
  signOut: mockSignOut,
}))

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const { UserMenu } = await import("./user-menu")

const T = {
  ariaLabel: "Account menu",
  languageLabel: "Language",
  bn: "বাংলা",
  en: "English",
  signOut: "Log out",
}

/**
 * Radix's `DropdownMenuTrigger` opens on `pointerdown`, not `click` — a bare
 * `.click()` (what jsdom's `HTMLElement.click()` dispatches) never opens it.
 */
async function openMenu(trigger: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.click(trigger)
  })
}

/**
 * Review follow-up on PR #51: the signed-in shell had no sign-out control
 * anywhere. This proves the new destructive `DropdownMenuItem` reuses the
 * existing `signOut` server action rather than a new one, and that selecting
 * it is enough — no confirmation dialog is required to reach it.
 */
describe("UserMenu", () => {
  it("shows a Sign out item that calls the existing signOut action", async () => {
    render(<UserMenu locale="en" t={T} />)
    await openMenu(screen.getByRole("button", { name: "Account menu" }))

    const signOutItem = await screen.findByRole("menuitem", {
      name: "Log out",
    })

    await act(async () => {
      fireEvent.pointerDown(signOutItem)
      fireEvent.pointerUp(signOutItem)
      fireEvent.click(signOutItem)
    })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it("still switches language from the same menu", async () => {
    render(<UserMenu locale="en" t={T} />)
    await openMenu(screen.getByRole("button", { name: "Account menu" }))

    const bengaliOption = await screen.findByRole("menuitemradio", {
      name: "বাংলা",
    })

    await act(async () => {
      fireEvent.pointerDown(bengaliOption)
      fireEvent.pointerUp(bengaliOption)
      fireEvent.click(bengaliOption)
    })

    expect(mockUpdateLocale).toHaveBeenCalledWith("bn")
  })
})
