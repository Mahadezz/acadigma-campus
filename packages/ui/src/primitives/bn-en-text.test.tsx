import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { applyNumeralPreference, BnEnText, splitBnEnRuns } from "./bn-en-text"

describe("splitBnEnRuns", () => {
  it("keeps a pure English string as one run", () => {
    expect(splitBnEnRuns("Class 6")).toEqual([{ lang: "en", text: "Class 6" }])
  })

  it("keeps a pure Bengali string as one run", () => {
    expect(splitBnEnRuns("রহিম উদ্দিন")).toEqual([
      { lang: "bn", text: "রহিম উদ্দিন" },
    ])
  })

  it("splits at a script boundary", () => {
    expect(splitBnEnRuns("Rahim রহিম")).toEqual([
      { lang: "en", text: "Rahim " },
      { lang: "bn", text: "রহিম" },
    ])
  })

  it("attaches neutral punctuation to the run it follows", () => {
    const runs = splitBnEnRuns("Rahim, রহিম")
    expect(runs).toEqual([
      { lang: "en", text: "Rahim, " },
      { lang: "bn", text: "রহিম" },
    ])
  })

  it("treats a Bengali digit as Bengali script, splitting from English text", () => {
    // ৬ is in the Bengali Unicode block (U+09E6) — it gets a Bengali voice,
    // so it is its own run rather than being absorbed into "Class ".
    expect(splitBnEnRuns("Class ৬")).toEqual([
      { lang: "en", text: "Class " },
      { lang: "bn", text: "৬" },
    ])
  })
})

describe("applyNumeralPreference", () => {
  it("converts ASCII digits to Bengali", () => {
    expect(applyNumeralPreference("Class 6", "bn")).toBe("Class ৬")
  })

  it("converts Bengali digits to ASCII", () => {
    expect(applyNumeralPreference("ক্লাস ৬", "en")).toBe("ক্লাস 6")
  })
})

describe("BnEnText", () => {
  it("renders each run in a span with the correct lang attribute", () => {
    render(<BnEnText text="Rahim রহিম" data-testid="mixed" />)
    const container = screen.getByTestId("mixed")
    expect(container.tagName).toBe("BDI")
    const spans = container.querySelectorAll("span")
    expect(spans).toHaveLength(2)
    expect(spans[0]).toHaveAttribute("lang", "en")
    expect(spans[0]).toHaveTextContent("Rahim")
    expect(spans[1]).toHaveAttribute("lang", "bn")
    expect(spans[1]).toHaveTextContent("রহিম")
  })

  it("applies the numerals preference before splitting into runs", () => {
    render(<BnEnText text="Class 6" numerals="bn" data-testid="mixed" />)
    expect(screen.getByTestId("mixed")).toHaveTextContent("Class ৬")
  })
})
