import { describe, expect, it } from "vitest"

import {
  completeOnboardingInputSchema,
  getOnboardingStateOutputSchema,
  onboardingDraftSchema,
  onboardingStepSchema,
  saveOnboardingDraftInputSchema,
} from "./onboarding"

describe("onboardingDraftSchema", () => {
  it("accepts an empty draft", () => {
    expect(onboardingDraftSchema.safeParse({}).success).toBe(true)
  })

  it("accepts a partially filled draft — §10 'never fails validation'", () => {
    expect(
      onboardingDraftSchema.safeParse({ name: "Ideal School" }).success
    ).toBe(true)
    expect(
      onboardingDraftSchema.safeParse({
        name: "Ideal School",
        board: "dhaka",
        working_days: [6, 7, 1, 2, 3, 4],
      }).success
    ).toBe(true)
  })

  it("rejects a draft over the size cap", () => {
    const huge = { blob: "x".repeat(40_000) }
    expect(onboardingDraftSchema.safeParse(huge).success).toBe(false)
  })
})

describe("onboardingStepSchema", () => {
  it("accepts 1 through 5", () => {
    for (const step of [1, 2, 3, 4, 5]) {
      expect(onboardingStepSchema.safeParse(step).success).toBe(true)
    }
  })

  it("rejects 0 and 6", () => {
    expect(onboardingStepSchema.safeParse(0).success).toBe(false)
    expect(onboardingStepSchema.safeParse(6).success).toBe(false)
  })
})

describe("saveOnboardingDraftInputSchema", () => {
  it("round-trips a draft saved at step 3 (draft round-trip, §8 Part 2 tests)", () => {
    const input = {
      path: "create_school" as const,
      step: 3,
      draft: { name: "Ideal School & College", board: "dhaka" },
    }
    const parsed = saveOnboardingDraftInputSchema.safeParse(input)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual(input)
    }
  })

  it("rejects an unknown path value", () => {
    expect(
      saveOnboardingDraftInputSchema.safeParse({
        path: "give_up",
        step: 1,
        draft: {},
      }).success
    ).toBe(false)
  })
})

describe("getOnboardingStateOutputSchema", () => {
  it("accepts a fresh, never-started state", () => {
    expect(
      getOnboardingStateOutputSchema.safeParse({
        path: "undecided",
        step: 1,
        draft: {},
        memberships: [],
        completedAt: null,
      }).success
    ).toBe(true)
  })

  it("accepts a completed state with memberships", () => {
    expect(
      getOnboardingStateOutputSchema.safeParse({
        path: "create_school",
        step: 5,
        draft: {},
        memberships: [
          {
            workspaceId: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70",
            name: "Ideal School",
            type: "school",
            role: "owner",
            status: "active",
            logoUrl: null,
          },
        ],
        completedAt: "2026-09-25T12:00:00Z",
      }).success
    ).toBe(true)
  })
})

describe("completeOnboardingInputSchema", () => {
  it("accepts the three known exits", () => {
    for (const exit of ["personal", "created", "joined"]) {
      expect(completeOnboardingInputSchema.safeParse({ exit }).success).toBe(
        true
      )
    }
  })

  it("rejects an unknown exit", () => {
    expect(
      completeOnboardingInputSchema.safeParse({ exit: "abandoned" }).success
    ).toBe(false)
  })
})
