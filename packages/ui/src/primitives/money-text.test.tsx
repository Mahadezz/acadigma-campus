import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MoneyText, formatMoneyText } from "./money-text"

describe("formatMoneyText — Indian grouping", () => {
  it("groups 12,50,000 (2,2,3), not the western 1,250,000", () => {
    expect(formatMoneyText(125_000_000)).toBe("৳12,50,000.00")
  })

  it("keeps western-equivalent grouping below one lakh", () => {
    expect(formatMoneyText(123_456)).toBe("৳1,234.56")
  })

  it("handles a small amount with no grouping at all", () => {
    expect(formatMoneyText(5000)).toBe("৳50.00")
  })

  it("prefixes the minus sign before the currency sign", () => {
    expect(formatMoneyText(-50_000)).toBe("-৳500.00")
  })
})

describe("formatMoneyText — numerals", () => {
  it("renders Bengali digits end to end when numerals is bn", () => {
    expect(formatMoneyText(125_000_000, { numerals: "bn" })).toBe(
      "৳১২,৫০,০০০.০০"
    )
  })

  it("renders a negative amount in Bengali digits", () => {
    expect(formatMoneyText(-50_000, { numerals: "bn" })).toBe("-৳৫০০.০০")
  })
})

describe("formatMoneyText — sign", () => {
  it("adds a + for a positive amount when sign is requested", () => {
    expect(formatMoneyText(123_456, { sign: true })).toBe("+৳1,234.56")
  })

  it("still renders - for a negative amount when sign is requested", () => {
    expect(formatMoneyText(-123_456, { sign: true })).toBe("-৳1,234.56")
  })

  it("omits any sign on a positive amount by default", () => {
    expect(formatMoneyText(123_456)).toBe("৳1,234.56")
  })
})

describe("formatMoneyText — compact (lakh/crore)", () => {
  it("abbreviates one and a quarter lakh taka as L", () => {
    // ৳1,25,000.00 -> 1.25L, rounded to one decimal -> 1.3L
    expect(formatMoneyText(125_000_00, { compact: true })).toBe("৳1.3L")
  })

  it("abbreviates crore-scale amounts as Cr", () => {
    // ৳3,20,00,000 -> 3.2 crore
    expect(formatMoneyText(32_000_000_00, { compact: true })).toBe("৳3.2Cr")
  })

  it("falls back to full grouped formatting below one lakh", () => {
    expect(formatMoneyText(123_456, { compact: true })).toBe("৳1,234.56")
  })

  it("compact and Bengali numerals combine", () => {
    expect(formatMoneyText(125_000_00, { compact: true, numerals: "bn" })).toBe(
      "৳১.৩L"
    )
  })
})

describe("formatMoneyText — bigint input", () => {
  it("formats a bigint the same as the equivalent number", () => {
    expect(formatMoneyText(125_000_000n)).toBe(formatMoneyText(125_000_000))
  })
})

describe("MoneyText component", () => {
  it("renders inside a <bdi> element with tabular numerals", () => {
    render(<MoneyText paisa={123_456} data-testid="amount" />)
    const el = screen.getByTestId("amount")
    expect(el.tagName).toBe("BDI")
    expect(el).toHaveTextContent("৳1,234.56")
    expect(el.className).toContain("tabular-nums")
  })

  it("tints a negative amount only when signed is set", () => {
    const { rerender } = render(
      <MoneyText paisa={-5000} data-testid="amount" />
    )
    expect(screen.getByTestId("amount").className).not.toContain(
      "text-danger-ink"
    )

    rerender(<MoneyText paisa={-5000} signed data-testid="amount" />)
    expect(screen.getByTestId("amount").className).toContain("text-danger-ink")
  })

  it("renders Bengali numerals end to end", () => {
    render(<MoneyText paisa={125_000_000} numerals="bn" data-testid="bn" />)
    expect(screen.getByTestId("bn")).toHaveTextContent("৳১২,৫০,০০০.০০")
  })
})
