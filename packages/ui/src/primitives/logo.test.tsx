import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GridMark, Logo, type MarkName } from "./logo"

/**
 * The brand's own exports, verbatim: acadigma-brand/exports/logo/svg/acadigma-mark-black.svg
 * and exports/products/<name>/svg/<name>-mark-black.svg. GridMark must draw exactly these
 * rects — same order, geometry and kind — with #0B0B0B as currentColor and the #A3A3A3 grey
 * as currentColor at fill-opacity 0.35.
 */
const BRAND_SVGS: Record<MarkName, string> = {
  acadigma:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 544 544"><rect x="0" y="0" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="184" y="0" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="368" y="0" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="0" y="184" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="184" y="184" width="152" height="152" rx="24" fill="#A3A3A3"/><rect x="368" y="184" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="0" y="368" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="184" y="368" width="152" height="152" rx="24" fill="#0B0B0B"/><rect x="369" y="369" width="150" height="150" rx="23" fill="none" stroke="#0B0B0B" stroke-width="26"/></svg>',
  campus:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 544 544"><rect x="0" y="0" width="520" height="152" rx="24" fill="#0B0B0B"/><rect x="0" y="184" width="152" height="336" rx="24" fill="#0B0B0B"/><rect x="368" y="184" width="152" height="336" rx="24" fill="#0B0B0B"/><rect x="184" y="184" width="152" height="152" rx="24" fill="#A3A3A3"/><rect x="185" y="369" width="150" height="150" rx="23" fill="none" stroke="#0B0B0B" stroke-width="26"/></svg>',
  ledger:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 544 544"><rect x="0" y="368" width="152" height="152" rx="24" fill="#A3A3A3"/><rect x="184" y="184" width="152" height="336" rx="24" fill="#0B0B0B"/><rect x="368" y="0" width="152" height="520" rx="24" fill="#0B0B0B"/><rect x="185" y="1" width="150" height="150" rx="23" fill="none" stroke="#0B0B0B" stroke-width="26"/></svg>',
  students:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 544 544"><rect x="185" y="1" width="150" height="150" rx="23" fill="none" stroke="#0B0B0B" stroke-width="26"/><rect x="0" y="184" width="152" height="152" rx="24" fill="#A3A3A3"/><rect x="368" y="184" width="152" height="152" rx="24" fill="#A3A3A3"/><rect x="184" y="184" width="152" height="336" rx="24" fill="#0B0B0B"/></svg>',
  parents:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 544 544"><rect x="0" y="0" width="336" height="336" rx="24" fill="#0B0B0B"/><rect x="369" y="369" width="150" height="150" rx="23" fill="none" stroke="#0B0B0B" stroke-width="26"/></svg>',
}

type Drawn = [
  x: string,
  y: string,
  w: string,
  h: string,
  rx: string,
  kind: string,
]

function kindOf(fill: string | null, opacity: string | null): string {
  if (fill === "none") return "open"
  if (fill === "#A3A3A3" || opacity === "0.35") return "grey"
  return "fill"
}

function rects(root: ParentNode): Drawn[] {
  return Array.from(root.querySelectorAll("rect")).map((r) => [
    r.getAttribute("x") ?? "",
    r.getAttribute("y") ?? "",
    r.getAttribute("width") ?? "",
    r.getAttribute("height") ?? "",
    r.getAttribute("rx") ?? "",
    kindOf(r.getAttribute("fill"), r.getAttribute("fill-opacity")),
  ])
}

describe("GridMark", () => {
  it.each(Object.keys(BRAND_SVGS) as MarkName[])(
    "draws the %s mark exactly as the brand export",
    (mark) => {
      const brand = new DOMParser().parseFromString(
        BRAND_SVGS[mark],
        "image/svg+xml"
      )
      const { container } = render(<GridMark mark={mark} />)
      const svg = container.querySelector("svg")
      expect(svg).toHaveAttribute(
        "viewBox",
        brand.documentElement.getAttribute("viewBox")
      )
      expect(rects(container)).toEqual(rects(brand))
      for (const r of Array.from(container.querySelectorAll("rect"))) {
        const kind = kindOf(
          r.getAttribute("fill"),
          r.getAttribute("fill-opacity")
        )
        expect(r.getAttribute(kind === "open" ? "stroke" : "fill")).toBe(
          "currentColor"
        )
        if (kind === "grey") expect(r.getAttribute("fill-opacity")).toBe("0.35")
      }
    }
  )

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
