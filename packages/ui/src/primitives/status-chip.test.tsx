import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StatusChip } from "./status-chip"

describe("StatusChip — attendance status", () => {
  it("renders the letter glyph and the full status name", () => {
    render(<StatusChip status="present" data-testid="chip" />)
    const chip = screen.getByTestId("chip")
    expect(chip).toHaveTextContent("P")
    expect(chip).toHaveTextContent("Present")
  })

  it("uses the soft (tinted) fill by default", () => {
    render(<StatusChip status="absent" data-testid="chip" />)
    expect(screen.getByTestId("chip").className).toContain("bg-att-absent-soft")
  })

  it("uses the solid fill when variant is solid", () => {
    render(<StatusChip status="present" variant="solid" data-testid="chip" />)
    expect(screen.getByTestId("chip").className).toContain("bg-att-present")
    expect(screen.getByTestId("chip").className).not.toContain(
      "bg-att-present-soft"
    )
  })

  it("carries a ring for late (§2.4: falls below 3:1 against the card)", () => {
    render(<StatusChip status="late" data-testid="chip" />)
    expect(screen.getByTestId("chip").className).toContain("ring-att-late-ink")
  })

  it("carries a ring for half_day", () => {
    render(<StatusChip status="half_day" data-testid="chip" />)
    expect(screen.getByTestId("chip").className).toContain(
      "ring-att-halfday-ink"
    )
  })

  it("does not carry a ring for present, absent or excused", () => {
    for (const status of ["present", "absent", "excused"] as const) {
      render(<StatusChip status={status} data-testid={`chip-${status}`} />)
      expect(screen.getByTestId(`chip-${status}`).className).not.toContain(
        "ring-1"
      )
    }
  })

  it("renders the Bengali letter and name when locale is bn", () => {
    render(<StatusChip status="half_day" locale="bn" data-testid="chip" />)
    const chip = screen.getByTestId("chip")
    expect(chip).toHaveTextContent("অর্ধ")
    expect(chip).toHaveTextContent("অর্ধদিবস")
  })
})

describe("StatusChip — generic tone", () => {
  it("renders children and resolves the tone to a token class", () => {
    render(<StatusChip tone="positive">Paid</StatusChip>)
    expect(screen.getByText("Paid").className).toContain("bg-success-soft")
  })

  it("defaults to the neutral tone", () => {
    render(<StatusChip>Draft</StatusChip>)
    expect(screen.getByText("Draft").className).toContain("bg-muted")
  })
})
