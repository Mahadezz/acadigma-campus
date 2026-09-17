import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { MarkCell } from "./mark-cell"

describe("MarkCell", () => {
  it("exposes the required aria-label as the input's accessible name", () => {
    render(
      <MarkCell
        value={78}
        onCommit={() => {}}
        maxMarks={100}
        aria-label="Mathematics mark for Ayaan Rahman"
      />
    )
    // A bare numeric input has no visible <label>; getByRole with `name`
    // only finds it because aria-label is required, not optional.
    expect(
      screen.getByRole("textbox", {
        name: "Mathematics mark for Ayaan Rahman",
      })
    ).toBeInTheDocument()
  })

  it("selects the current value on focus", async () => {
    const user = userEvent.setup()
    render(
      <MarkCell
        value={78}
        onCommit={() => {}}
        maxMarks={100}
        aria-label="Mark"
      />
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    await user.click(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it("commits on blur", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <MarkCell
        value={null}
        onCommit={onCommit}
        maxMarks={100}
        aria-label="Mark"
      />
    )
    const input = screen.getByRole("textbox")
    await user.click(input)
    await user.keyboard("78")
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith(78)
  })

  it("commits and calls onNext on Enter", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const onNext = vi.fn()
    render(
      <MarkCell
        value={null}
        onCommit={onCommit}
        onNext={onNext}
        maxMarks={100}
        aria-label="Mark"
      />
    )
    await user.click(screen.getByRole("textbox"))
    await user.keyboard("55{Enter}")
    expect(onCommit).toHaveBeenCalledWith(55)
    expect(onNext).toHaveBeenCalled()
  })

  it("clamps a value above max_marks on commit", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <MarkCell
        value={null}
        onCommit={onCommit}
        maxMarks={100}
        aria-label="Mark"
      />
    )
    await user.click(screen.getByRole("textbox"))
    await user.keyboard("150")
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith(100)
  })

  it("shows the danger ring for an out-of-range value without blocking typing", async () => {
    const user = userEvent.setup()
    render(
      <MarkCell
        value={null}
        onCommit={() => {}}
        maxMarks={100}
        aria-label="Mark"
      />
    )
    const input = screen.getByRole("textbox")
    await user.click(input)
    await user.keyboard("150")
    expect(input).toHaveValue("150")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("clears to null on an empty commit", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <MarkCell
        value={80}
        onCommit={onCommit}
        maxMarks={100}
        aria-label="Mark"
      />
    )
    const input = screen.getByRole("textbox")
    await user.click(input)
    await user.keyboard("{Backspace}{Backspace}")
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith(null)
  })

  it("renders the derived grade chip once the value is valid", () => {
    render(
      <MarkCell
        value={92}
        onCommit={() => {}}
        maxMarks={100}
        aria-label="Mark"
        getGrade={(value) =>
          value >= 80 ? { band: "a-plus", label: "A+" } : undefined
        }
      />
    )
    expect(screen.getByText("A+")).toBeInTheDocument()
  })

  it("does not render a grade chip while the value is out of range", () => {
    render(
      <MarkCell
        value={150}
        onCommit={() => {}}
        maxMarks={100}
        aria-label="Mark"
        getGrade={() => ({ band: "a-plus", label: "A+" })}
      />
    )
    expect(screen.queryByText("A+")).not.toBeInTheDocument()
  })
})
