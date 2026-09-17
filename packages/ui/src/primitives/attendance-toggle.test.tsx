import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AttendanceToggle } from "./attendance-toggle"

describe("AttendanceToggle", () => {
  it("is a radiogroup labelled with the student's name", () => {
    render(
      <AttendanceToggle
        value="unmarked"
        onChange={() => {}}
        studentName="Rahim Uddin"
      />
    )
    expect(
      screen.getByRole("radiogroup", { name: "Rahim Uddin" })
    ).toBeInTheDocument()
  })

  it("renders five segments, none checked when unmarked", () => {
    render(
      <AttendanceToggle
        value="unmarked"
        onChange={() => {}}
        studentName="Rahim Uddin"
      />
    )
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(5)
    expect(
      radios.every((r) => r.getAttribute("aria-checked") === "false")
    ).toBe(true)
  })

  it("marks the matching segment checked", () => {
    render(
      <AttendanceToggle
        value="present"
        onChange={() => {}}
        studentName="Rahim Uddin"
      />
    )
    expect(screen.getByRole("radio", { name: "Present" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })

  it("calls onChange with the tapped status", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AttendanceToggle
        value="unmarked"
        onChange={onChange}
        studentName="Rahim Uddin"
      />
    )
    await user.click(screen.getByRole("radio", { name: "Absent" }))
    expect(onChange).toHaveBeenCalledWith("absent")
  })

  it("moves selection with arrow keys", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AttendanceToggle
        value="present"
        onChange={onChange}
        studentName="Rahim Uddin"
      />
    )
    screen.getByRole("radio", { name: "Present" }).focus()
    await user.keyboard("{ArrowRight}")
    expect(onChange).toHaveBeenCalledWith("absent")
  })

  it("renders the Bengali letters when locale is bn", () => {
    render(
      <AttendanceToggle
        value="unmarked"
        onChange={() => {}}
        studentName="রহিম উদ্দিন"
        locale="bn"
      />
    )
    expect(screen.getByRole("radio", { name: "উপস্থিত" })).toBeInTheDocument()
  })
})
