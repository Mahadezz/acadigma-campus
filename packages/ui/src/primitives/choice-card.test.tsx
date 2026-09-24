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

  it("disables the button variant when disabled is set", () => {
    render(
      <ChoiceCard
        icon={<span />}
        title="Create a school"
        description="…"
        onClick={() => {}}
        disabled
      />
    )
    expect(screen.getByRole("button")).toBeDisabled()
  })
})
