import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CountUp } from "./count-up"

describe("CountUp", () => {
  it("renders the finished value, so nothing depends on the animation", () => {
    render(<CountUp text="92.5%" />)
    expect(screen.getByText("92.5%")).toBeInTheDocument()
  })

  it("shows text it cannot parse unchanged", () => {
    render(<CountUp text="—" />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })
})
