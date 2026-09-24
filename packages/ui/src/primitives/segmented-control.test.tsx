import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SegmentedControl } from "./segmented-control"

const OPTIONS = [
  { value: "bangla", label: "Bangla" },
  { value: "english", label: "English medium" },
] as const

describe("SegmentedControl", () => {
  it("renders a labelled radiogroup with one radio per option", () => {
    render(
      <SegmentedControl
        label="School type"
        options={OPTIONS}
        value="bangla"
        onChange={vi.fn()}
      />
    )
    expect(
      screen.getByRole("radiogroup", { name: "School type" })
    ).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Bangla" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    expect(
      screen.getByRole("radio", { name: "English medium" })
    ).toHaveAttribute("aria-checked", "false")
  })

  it("calls onChange with the clicked option's value", async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="School type"
        options={OPTIONS}
        value="bangla"
        onChange={onChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: "English medium" }))
    expect(onChange).toHaveBeenCalledWith("english")
  })

  it("moves the selection with the arrow keys", async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="School type"
        options={OPTIONS}
        value="bangla"
        onChange={onChange}
      />
    )
    screen.getByRole("radio", { name: "Bangla" }).focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(onChange).toHaveBeenCalledWith("english")
  })
})
