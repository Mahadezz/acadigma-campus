import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

/**
 * D-101 (production bug): after the sign-in rate limit tripped, the wait
 * showed twice — in the banner AND as the submit button's label — and as raw
 * seconds ("900s"). The banner alone carries it, in minutes; the button
 * stays "Sign in", disabled.
 */
// Radix Checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

const signInWithPassword = vi.fn()
vi.mock("../actions", () => ({
  signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
}))

const { LoginForm } = await import("./login-form")

async function submitThrottled(
  t: typeof en.auth.login,
  locale: "en" | "bn" = "en",
  retryAfterSeconds = 900
) {
  signInWithPassword.mockResolvedValue({
    ok: false,
    error: { code: "rate_limited", message: "x", retryAfterSeconds },
  })
  render(<LoginForm t={t} network={en.auth.network} locale={locale} />)
  fireEvent.change(screen.getByLabelText(t.emailLabel), {
    target: { value: "a@b.co" },
  })
  fireEvent.change(screen.getByLabelText(t.passwordLabel), {
    target: { value: "correct horse battery" },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: t.submitButton }))
  })
}

describe("LoginForm when rate-limited", () => {
  it("shows the wait once, in minutes, and keeps the button a disabled 'Sign in'", async () => {
    await submitThrottled(en.auth.login)

    expect(
      screen.getByText("Too many attempts. Try again in 15 min.")
    ).toBeTruthy()
    const button = screen.getByRole("button", {
      name: en.auth.login.submitButton,
    })
    expect(button.hasAttribute("disabled")).toBe(true)
    expect(screen.queryByText(/900/)).toBeNull()
  })

  it("says it in Bangla too", async () => {
    await submitThrottled(bn.auth.login, "bn")
    expect(
      screen.getByText(
        "অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।"
      )
    ).toBeTruthy()
  })

  it("rounds a short wait up to one minute", async () => {
    await submitThrottled(en.auth.login, "en", 30)
    expect(
      screen.getByText("Too many attempts. Try again in 1 min.")
    ).toBeTruthy()
  })

  it("announces the wait as an alert", async () => {
    await submitThrottled(en.auth.login)
    expect(screen.getByRole("alert").textContent).toContain("15 min")
  })

  it("re-enables the button when the wait runs out", async () => {
    vi.useFakeTimers()
    try {
      await submitThrottled(en.auth.login, "en", 90)
      const button = () =>
        screen.getByRole("button", { name: en.auth.login.submitButton })
      expect(button().hasAttribute("disabled")).toBe(true)
      expect(
        screen.getByText("Too many attempts. Try again in 2 min.")
      ).toBeTruthy()
      await act(async () => {
        vi.advanceTimersByTime(30_000)
      })
      expect(
        screen.getByText("Too many attempts. Try again in 1 min.")
      ).toBeTruthy()
      await act(async () => {
        vi.advanceTimersByTime(60_000)
      })
      expect(button().hasAttribute("disabled")).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
