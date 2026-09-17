import { describe, expect, it } from "vitest"

import {
  computeDowngrade,
  computeFullPriceUpgrade,
  computeMonthlyToYearlyUpgrade,
  computeUpgradeWithinPeriod,
} from "./proration"

describe("computeUpgradeWithinPeriod — §5.4 worked example", () => {
  it("Starter → Pro, 30-day cycle, 12 days elapsed: due exactly ৳3,000.00", () => {
    const result = computeUpgradeWithinPeriod({
      oldPricePaisa: 299_900,
      newPricePaisa: 799_900,
      cycleDays: 30,
      elapsedDays: 12,
    })

    expect(result).toEqual({
      remainingDays: 18,
      unusedCreditPaisa: 179_940,
      newChargePaisa: 479_940,
      amountDuePaisa: 300_000,
    })
  })

  it("day 0 of the cycle: the full remaining period is credited and charged", () => {
    const result = computeUpgradeWithinPeriod({
      oldPricePaisa: 299_900,
      newPricePaisa: 799_900,
      cycleDays: 30,
      elapsedDays: 0,
    })
    expect(result.remainingDays).toBe(30)
    expect(result.unusedCreditPaisa).toBe(299_900)
    expect(result.newChargePaisa).toBe(799_900)
    expect(result.amountDuePaisa).toBe(500_000)
  })

  it("the final day of the cycle: zero remaining days, zero due (§11 open question 6)", () => {
    const result = computeUpgradeWithinPeriod({
      oldPricePaisa: 299_900,
      newPricePaisa: 799_900,
      cycleDays: 30,
      elapsedDays: 30,
    })
    expect(result).toEqual({
      remainingDays: 0,
      unusedCreditPaisa: 0,
      newChargePaisa: 0,
      amountDuePaisa: 0,
    })
  })

  it("elapsedDays beyond cycleDays clamps remainingDays at zero rather than going negative", () => {
    const result = computeUpgradeWithinPeriod({
      oldPricePaisa: 299_900,
      newPricePaisa: 799_900,
      cycleDays: 30,
      elapsedDays: 35,
    })
    expect(result.remainingDays).toBe(0)
    expect(result.amountDuePaisa).toBe(0)
  })

  it("never returns a negative amountDuePaisa when the new plan is cheaper", () => {
    const result = computeUpgradeWithinPeriod({
      oldPricePaisa: 799_900,
      newPricePaisa: 299_900,
      cycleDays: 30,
      elapsedDays: 12,
    })
    expect(result.amountDuePaisa).toBe(0)
  })

  it("rejects a non-positive cycleDays", () => {
    expect(() =>
      computeUpgradeWithinPeriod({
        oldPricePaisa: 0,
        newPricePaisa: 0,
        cycleDays: 0,
        elapsedDays: 0,
      })
    ).toThrow(RangeError)
  })
})

describe("computeMonthlyToYearlyUpgrade", () => {
  it("deducts the same unused monthly credit from the full yearly price", () => {
    const result = computeMonthlyToYearlyUpgrade({
      oldMonthlyPricePaisa: 299_900,
      newYearlyPricePaisa: 7_999_000,
      cycleDays: 30,
      elapsedDays: 12,
    })
    expect(result.remainingDays).toBe(18)
    expect(result.unusedCreditPaisa).toBe(179_940)
    expect(result.amountDuePaisa).toBe(7_999_000 - 179_940)
  })

  it("never returns a negative amount when the credit would exceed the yearly price", () => {
    const result = computeMonthlyToYearlyUpgrade({
      oldMonthlyPricePaisa: 799_900,
      newYearlyPricePaisa: 100,
      cycleDays: 30,
      elapsedDays: 0,
    })
    expect(result.amountDuePaisa).toBe(0)
  })
})

describe("computeFullPriceUpgrade — trialing / past_due / lapsed (§5.4)", () => {
  it("charges the full price with no credit", () => {
    expect(computeFullPriceUpgrade(799_900)).toEqual({
      unusedCreditPaisa: 0,
      amountDuePaisa: 799_900,
    })
  })
})

describe("computeDowngrade — §5.5, no proration ever", () => {
  it("is always zero", () => {
    expect(computeDowngrade()).toEqual({ amountDuePaisa: 0 })
  })
})
