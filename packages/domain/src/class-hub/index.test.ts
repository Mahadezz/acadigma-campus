import { describe, expect, it } from "vitest"

import { CLASS_HUB_TABS } from "./index"

describe("CLASS_HUB_TABS", () => {
  it("lists exactly the tabs this Part ships, once each, in order", () => {
    expect(CLASS_HUB_TABS).toEqual(["attendance", "marks", "students", "print"])
  })

  it("has no duplicate ids", () => {
    expect(new Set(CLASS_HUB_TABS).size).toBe(CLASS_HUB_TABS.length)
  })
})
