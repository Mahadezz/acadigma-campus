import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GridMark, Logo } from "./logo"

function rects(container: HTMLElement) {
  return Array.from(container.querySelectorAll("rect")).map((r) =>
    ["x", "y", "width", "height", "rx", "fill"].map((a) => r.getAttribute(a))
  )
}

describe("GridMark", () => {
  it("draws the campus mark exactly as acadigma-brand's campus-mark-black.svg", () => {
    const { container } = render(<GridMark mark="campus" />)
    expect(container.querySelector("svg")).toHaveAttribute(
      "viewBox",
      "-12 -12 544 544"
    )
    // Copied from exports/products/campus/svg/campus-mark-black.svg (#0B0B0B -> currentColor).
    expect(rects(container)).toEqual([
      ["0", "0", "520", "152", "24", "currentColor"],
      ["0", "184", "152", "336", "24", "currentColor"],
      ["368", "184", "152", "336", "24", "currentColor"],
      ["184", "184", "152", "152", "24", "currentColor"],
      ["185", "369", "150", "150", "23", "none"],
    ])
  })

  it("is decorative without a title, and an img with one", () => {
    const { container, rerender } = render(<GridMark mark="ledger" />)
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    rerender(<GridMark mark="ledger" title="Acadigma Ledger" />)
    expect(
      screen.getByRole("img", { name: "Acadigma Ledger" })
    ).toBeInTheDocument()
  })

  it("renders all nine cells of the parent mark", () => {
    const { container } = render(<GridMark />)
    expect(container.querySelectorAll("rect")).toHaveLength(9)
  })
})

describe("Logo", () => {
  it("reads 'Acadigma Campus' with the product name in the muted ink", () => {
    const { container } = render(<Logo product="campus" />)
    expect(container.textContent).toBe("Acadigma Campus")
    expect(screen.getByText("Campus")).toHaveClass("text-muted-foreground")
    expect(container.querySelector("svg")).toHaveAttribute(
      "data-mark",
      "campus"
    )
  })

  it("is the parent lockup without a product", () => {
    const { container } = render(<Logo />)
    expect(container.textContent).toBe("Acadigma")
  })
})
