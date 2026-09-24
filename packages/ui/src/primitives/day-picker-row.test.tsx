import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DayPickerRow } from "./day-picker-row"

const SAT_FIRST = [
  { value: 6, label: "Sat", fullLabel: "Saturday" },
  { value: 7, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
] as const

describe("DayPickerRow", () => {
  it("renders a labelled checkbox group with seven chips", () => {
    render(
      <DayPickerRow
        legend="Working days"
        options={SAT_FIRST}
        value={[6, 7, 1, 2, 3, 4]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText("Working days")).toBeInTheDocument()
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(7)
  })

  it("marks the Sat-Thu default as checked, Friday unchecked (§5)", () => {
    render(
      <DayPickerRow
        legend="Working days"
        options={SAT_FIRST}
        value={[6, 7, 1, 2, 3, 4]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole("checkbox", { name: "Saturday" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(screen.getByRole("checkbox", { name: "Friday" })).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })

  it("toggles a day on click", async () => {
    const onChange = vi.fn()
    render(
      <DayPickerRow
        legend="Working days"
        options={SAT_FIRST}
        value={[6, 7, 1, 2, 3, 4]}
        onChange={onChange}
      />
    )
    await userEvent.click(screen.getByRole("checkbox", { name: "Friday" }))
    expect(onChange).toHaveBeenCalledWith([6, 7, 1, 2, 3, 4, 5])

    await userEvent.click(screen.getByRole("checkbox", { name: "Saturday" }))
    expect(onChange).toHaveBeenCalledWith([7, 1, 2, 3, 4])
  })

  it("moves focus between chips with the arrow keys without toggling them", async () => {
    const onChange = vi.fn()
    render(
      <DayPickerRow
        legend="Working days"
        options={SAT_FIRST}
        value={[6]}
        onChange={onChange}
      />
    )
    screen.getByRole("checkbox", { name: "Saturday" }).focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByRole("checkbox", { name: "Sunday" })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })
})
