import { describe, expect, it } from "vitest"

import {
  buildEntitledNavModules,
  NAV_MODULE_TO_PLAN_MODULE,
} from "./entitlements"
import { NAV_MODULE_KEYS } from "./types"

describe("buildEntitledNavModules", () => {
  it("includes every nav module key that has no plan-module mapping, regardless of plan", () => {
    const entitled = buildEntitledNavModules([])
    for (const key of NAV_MODULE_KEYS) {
      if (!NAV_MODULE_TO_PLAN_MODULE[key]) {
        expect(entitled.has(key)).toBe(true)
      }
    }
  })

  it("excludes a mapped nav key when its plan module is not enabled", () => {
    const entitled = buildEntitledNavModules([])
    expect(entitled.has("attendance")).toBe(false)
    expect(entitled.has("hiring")).toBe(false)
    expect(entitled.has("timetable")).toBe(false) // maps to "academics"
  })

  it("includes a mapped nav key once its plan module is enabled", () => {
    const entitled = buildEntitledNavModules(["attendance", "academics"])
    expect(entitled.has("attendance")).toBe(true)
    expect(entitled.has("timetable")).toBe(true)
    expect(entitled.has("students")).toBe(true)
    expect(entitled.has("hiring")).toBe(false)
  })

  it("accepts a Set as well as an array (PlanModuleSet)", () => {
    const entitled = buildEntitledNavModules(new Set(["attendance"]))
    expect(entitled.has("attendance")).toBe(true)
  })

  it("matches a Pro-shaped plan: academics + attendance + hiring + cover + marketplace on, ai/billing/staff always on", () => {
    const proModules = [
      "academics",
      "attendance",
      "lessons",
      "messaging",
      "resources",
      "reports",
      "print",
      "hiring",
      "cover",
      "analytics",
      "marketplace_school_funded",
      "custom_labels",
    ]
    const entitled = buildEntitledNavModules(proModules)
    for (const key of NAV_MODULE_KEYS) {
      expect(entitled.has(key)).toBe(true)
    }
  })

  it("matches a Starter-shaped plan: hiring/cover/marketplace stay hidden", () => {
    const starterModules = [
      "academics",
      "attendance",
      "lessons",
      "messaging",
      "resources",
      "reports",
      "print",
    ]
    const entitled = buildEntitledNavModules(starterModules)
    expect(entitled.has("hiring")).toBe(false)
    expect(entitled.has("cover")).toBe(false)
    expect(entitled.has("marketplace")).toBe(false)
    expect(entitled.has("attendance")).toBe(true)
    expect(entitled.has("timetable")).toBe(true)
  })
})
