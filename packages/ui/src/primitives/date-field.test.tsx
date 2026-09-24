import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DateField } from "./date-field"

describe("DateField", () => {
  it("renders a native date input with a label", () => {
    render(
      <DateField
        id="starts-on"
        label="Starts"
        value="2026-01-01"
        onChange={vi.fn()}
      />
    )
    const input = screen.getByLabelText("Starts")
    expect(input).toHaveAttribute("type", "date")
    expect(input).toHaveValue("2026-01-01")
  })

  it("calls onChange when the value changes", () => {
    // fireEvent, not userEvent.type: jsdom's <input type="date"> does not
    // support character-by-character typing the way a text input does —
    // fireEvent.change is the standard workaround for date/time inputs.
    const onChange = vi.fn()
    render(
      <DateField
        id="starts-on"
        label="Starts"
        value="2026-01-01"
        onChange={onChange}
      />
    )
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "2026-02-01" },
    })
    expect(onChange).toHaveBeenCalledWith("2026-02-01")
  })

  it("shows an error message and marks the field invalid", () => {
    render(
      <DateField
        id="ends-on"
        label="Ends"
        value="2026-01-01"
        onChange={vi.fn()}
        errorText="The end date must be after the start date."
      />
    )
    expect(screen.getByLabelText("Ends")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(
      screen.getByText("The end date must be after the start date.")
    ).toBeInTheDocument()
  })
})
