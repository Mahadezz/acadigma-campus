import { describe, expect, it } from "vitest"

import { canGoBack, record } from "./in-app-history"

describe("in-app history (D-408)", () => {
  it("counts a Link back to an earlier page as a visit, and a popstate as a step back", () => {
    record("/app/exams") // first load: nothing to go back to
    expect(canGoBack()).toBe(false)
    record("/app/exams/e1")
    record("/app/exams") // a forward Link that revisits A
    record("/app/exams/e1")
    expect(canGoBack()).toBe(true)

    window.dispatchEvent(new PopStateEvent("popstate"))
    record("/app/exams") // browser back
    expect(canGoBack()).toBe(true) // [A, B, A, B] stepped back to [A, B, A]
    window.dispatchEvent(new PopStateEvent("popstate"))
    record("/app/exams/e1")
    window.dispatchEvent(new PopStateEvent("popstate"))
    record("/app/exams")
    expect(canGoBack()).toBe(false)
  })
})
