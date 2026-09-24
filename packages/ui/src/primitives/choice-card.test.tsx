import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ChoiceCard } from "./choice-card"

describe("ChoiceCard", () => {
  it("renders an <a> with an href, title and description", () => {
    render(
      <ChoiceCard
        icon={<span data-testid="icon" />}
        title="Create a school"
        description="Set up your school, invite your teachers, start taking attendance."
        href="/onboarding/create-school"
      />
    )
    const link = screen.getByRole("link", { name: /create a school/i })
    expect(link).toHaveAttribute("href", "/onboarding/create-school")
    expect(screen.getByText(/set up your school/i)).toBeInTheDocument()
    expect(screen.getByTestId("icon")).toBeInTheDocument()
  })

  it("renders a <button> when onClick is given instead of href", async () => {
    const onClick = vi.fn()
    render(
      <ChoiceCard
        icon={<span />}
        title="Join a school"
        description="Enter the code they gave you."
        onClick={onClick}
      />
    )
    const button = screen.getByRole("button", { name: /join a school/i })
    button.click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("is at least 120px tall (§6 wireframe)", () => {
    render(
      <ChoiceCard
        icon={<span />}
        title="Create a school"
        description="…"
        href="/x"
      />
    )
    expect(screen.getByRole("link").className).toContain("min-h-[120px]")
  })

  it("renders a non-interactive, aria-disabled card with a badge instead of a dead link when disabled", () => {
    render(
      <ChoiceCard
        icon={<span />}
        title="Create a school"
        description="…"
        href="/onboarding/create-school"
        disabled
        badge="Coming soon"
      />
    )
    // Never a real link — a disabled card must not be a dead href a user can click into.
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText("Coming soon")).toBeInTheDocument()
    const card = screen.getByText("Create a school").closest("[aria-disabled]")
    expect(card).toHaveAttribute("aria-disabled", "true")
  })

  it("does not render a badge when not disabled, even if one is passed", () => {
    render(
      <ChoiceCard
        icon={<span />}
        title="Create a school"
        description="…"
        href="/x"
        badge="Coming soon"
      />
    )
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument()
  })
})
