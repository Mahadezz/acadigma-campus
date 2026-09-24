import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OnboardingShell } from "./onboarding-shell"

describe("OnboardingShell", () => {
  it("renders the brand mark and children when there is no back link or progress", () => {
    render(
      <OnboardingShell>
        <p>chooser content</p>
      </OnboardingShell>
    )
    expect(screen.getByText("Acadigma Campus")).toBeInTheDocument()
    expect(screen.getByText("chooser content")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("renders a back link instead of the brand mark when backHref is given", () => {
    render(
      <OnboardingShell backHref="/app" backLabel="Back to Ideal School">
        <p>content</p>
      </OnboardingShell>
    )
    const link = screen.getByRole("link", { name: /back to ideal school/i })
    expect(link).toHaveAttribute("href", "/app")
    expect(screen.queryByText("Acadigma Campus")).not.toBeInTheDocument()
  })

  it("renders an accessible progressbar with the right aria attributes", () => {
    render(
      <OnboardingShell progress={{ current: 2, total: 5 }}>
        <p>step 2</p>
      </OnboardingShell>
    )
    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("aria-valuenow", "2")
    expect(bar).toHaveAttribute("aria-valuemax", "5")
  })

  it("renders the title as an <h1>", () => {
    render(<OnboardingShell title="Create a school">content</OnboardingShell>)
    expect(
      screen.getByRole("heading", { level: 1, name: "Create a school" })
    ).toBeInTheDocument()
  })

  it("renders actions top-right alongside the header", () => {
    render(
      <OnboardingShell actions={<button>Account</button>}>
        content
      </OnboardingShell>
    )
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument()
  })
})
