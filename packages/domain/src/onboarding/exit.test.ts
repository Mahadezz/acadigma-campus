import { describe, expect, it } from "vitest"

import { resolveOnboardingExitRoute } from "./exit"

describe("resolveOnboardingExitRoute", () => {
  it("sends the tutoring exit to /personal (§4.5 row 3)", () => {
    expect(resolveOnboardingExitRoute("personal")).toBe("/personal")
  })

  it("sends a created school to /app (§4.5 row 1)", () => {
    expect(resolveOnboardingExitRoute("created")).toBe("/app")
  })

  it("sends a pending join to /personal (§4.5 row 2)", () => {
    expect(resolveOnboardingExitRoute("joined")).toBe("/personal")
  })
})
