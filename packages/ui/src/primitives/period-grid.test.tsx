import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PeriodGrid, type PeriodGridCell } from "./period-grid"

const days = [
  { id: "sat", labelEn: "Sat", labelBn: "শনি" },
  { id: "sun", labelEn: "Sun", labelBn: "রবি" },
]
const periods = [
  { id: "p1", labelEn: "Period 1", timeRange: "8:00–8:45" },
  { id: "p2", labelEn: "Period 2", timeRange: "8:45–9:30" },
]

function getCell(dayId: string, periodId: string): PeriodGridCell | undefined {
  if (dayId === "sat" && periodId === "p1") {
    return { subjectLabel: "Math", subjectKey: "math", room: "204" }
  }
  return undefined
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  })
}

describe("PeriodGrid — desktop (>=1024px)", () => {
  beforeEach(() => setViewportWidth(1280))

  it("renders a full days × periods table", () => {
    render(<PeriodGrid days={days} periods={periods} getCell={getCell} />)
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("Sat")).toBeInTheDocument()
    expect(screen.getByText("Sun")).toBeInTheDocument()
    expect(screen.getByText("Math")).toBeInTheDocument()
    expect(screen.getByText("204")).toBeInTheDocument()
  })

  it("marks the current period cell with aria-current=time", () => {
    render(
      <PeriodGrid
        days={days}
        periods={periods}
        getCell={getCell}
        currentDayId="sat"
        currentPeriodId="p1"
      />
    )
    const cell = screen.getByText("Math").closest("td")
    expect(cell).toHaveAttribute("aria-current", "time")
  })
})

describe("PeriodGrid — phone (<1024px)", () => {
  beforeEach(() => setViewportWidth(375))
  afterEach(() => setViewportWidth(1280))

  it("renders day tabs instead of a table", () => {
    render(<PeriodGrid days={days} periods={periods} getCell={getCell} />)
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByRole("tablist")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Sat" })).toBeInTheDocument()
  })

  it("follows a later currentDayId prop change (controlled, not defaultValue)", () => {
    const { rerender } = render(
      <PeriodGrid
        days={days}
        periods={periods}
        getCell={getCell}
        currentDayId="sat"
      />
    )
    expect(screen.getByRole("tab", { name: "Sat" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("tab", { name: "Sun" })).toHaveAttribute(
      "aria-selected",
      "false"
    )

    // The date rolls over while the app stays open — the parent re-renders
    // with a new currentDayId, uncontrolled `defaultValue` would ignore this.
    rerender(
      <PeriodGrid
        days={days}
        periods={periods}
        getCell={getCell}
        currentDayId="sun"
      />
    )
    expect(screen.getByRole("tab", { name: "Sun" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("tab", { name: "Sat" })).toHaveAttribute(
      "aria-selected",
      "false"
    )
  })

  it("still lets the user tap a different day's tab", async () => {
    const user = userEvent.setup()
    render(
      <PeriodGrid
        days={days}
        periods={periods}
        getCell={getCell}
        currentDayId="sat"
      />
    )
    await user.click(screen.getByRole("tab", { name: "Sun" }))
    expect(screen.getByRole("tab", { name: "Sun" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})
