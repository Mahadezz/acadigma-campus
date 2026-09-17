import { describe, expect, it } from "vitest"

import {
  PRO_TRIAL_DAYS,
  computeTrialEndsAt,
  isTrialActive,
  isTrialEndingSoon,
  trialDaysRemaining,
} from "./trial"

describe("computeTrialEndsAt", () => {
  it("adds 30 days by default (debate synthesis: Free tier folded into a 30-day Pro trial)", () => {
    const start = new Date("2026-09-17T00:00:00Z")
    expect(computeTrialEndsAt(start).toISOString()).toBe(
      "2026-10-17T00:00:00.000Z"
    )
    expect(PRO_TRIAL_DAYS).toBe(30)
  })

  it("accepts a different trial length — the real source of truth is plans.trial_days", () => {
    const start = new Date("2026-09-17T00:00:00Z")
    expect(computeTrialEndsAt(start, 14).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z"
    )
  })

  it("rejects a negative or non-integer trial length", () => {
    const start = new Date("2026-09-17T00:00:00Z")
    expect(() => computeTrialEndsAt(start, -1)).toThrow(RangeError)
    expect(() => computeTrialEndsAt(start, 1.5)).toThrow(RangeError)
  })
})

describe("trialDaysRemaining", () => {
  it("floors whole days left", () => {
    const now = new Date("2026-09-17T00:00:00Z")
    const endsAt = new Date("2026-09-20T12:00:00Z")
    expect(trialDaysRemaining(endsAt, now)).toBe(3)
  })

  it("never goes negative once the trial has ended", () => {
    const now = new Date("2026-10-05T00:00:00Z")
    const endsAt = new Date("2026-10-01T00:00:00Z")
    expect(trialDaysRemaining(endsAt, now)).toBe(0)
  })
})

describe("isTrialActive", () => {
  it("is true strictly before the end instant, false at and after", () => {
    const endsAt = new Date("2026-10-01T00:00:00Z")
    expect(isTrialActive(endsAt, new Date("2026-09-30T23:59:59Z"))).toBe(true)
    expect(isTrialActive(endsAt, new Date("2026-10-01T00:00:00Z"))).toBe(false)
    expect(isTrialActive(endsAt, new Date("2026-10-02T00:00:00Z"))).toBe(false)
  })
})

describe("isTrialEndingSoon", () => {
  it("is true at the T-3-days threshold (§4.2)", () => {
    const now = new Date("2026-09-28T09:00:00Z")
    const endsAt = new Date("2026-10-01T00:00:00Z")
    expect(isTrialEndingSoon(endsAt, now)).toBe(true)
  })

  it("is false with more than the threshold left", () => {
    const now = new Date("2026-09-20T09:00:00Z")
    const endsAt = new Date("2026-10-01T00:00:00Z")
    expect(isTrialEndingSoon(endsAt, now)).toBe(false)
  })

  it("is false once the trial has already ended — expiry is a different event", () => {
    const now = new Date("2026-10-02T09:00:00Z")
    const endsAt = new Date("2026-10-01T00:00:00Z")
    expect(isTrialEndingSoon(endsAt, now)).toBe(false)
  })
})
