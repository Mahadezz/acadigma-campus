import { describe, expect, it } from "vitest"

import {
  computeFullPriceUpgrade,
  computeMonthlyToYearlyUpgrade,
  computeUpgradeWithinPeriod,
} from "./proration"

/**
 * Property-style coverage for the proration arithmetic (F-CM-06 §5.4).
 *
 * `proration.test.ts` next door pins the spec's worked example and the edge
 * cases; this file asserts the INVARIANTS — the things that must hold for every
 * input, not just the round numbers where floor and ceil happen to agree with
 * exact division. Those are what catch a future refactor of the formula, which
 * is the realistic way this file breaks.
 *
 * The sweep is deterministic rather than randomised: a money test that fails
 * only on Tuesdays with seed 41 is a test nobody trusts or can reproduce. The
 * grid below is small enough to run in milliseconds and wide enough to include
 * every awkward case the formula has — primes that never divide evenly, the
 * live D-41 prices, a leap-year cycle, and day 0 through day `cycleDays`.
 */

/** Prices in paisa: the live D-41 grid, plus values chosen to force rounding. */
const PRICES = [
  0, // a comped subscription (§5.10)
  1_000, // the SSLCommerz ৳10.00 floor (§5.2)
  220_000, // Starter ৳2,200 (D-41 / MARKET-STRATEGY §c)
  490_000, // Pro ৳4,900
  1_800_000, // Enterprise ৳18,000
  2_420_000, // Starter yearly (11 x monthly)
  5_390_000, // Pro yearly
  19_800_000, // Enterprise yearly
  100_003, // prime-ish: never divides evenly by any cycle below
  999_983, // ditto, large
]

/** Real billing cycles: short month, leap February, long month, a year. */
const CYCLES = [28, 29, 30, 31, 365, 366]

type Case = {
  oldPricePaisa: number
  newPricePaisa: number
  cycleDays: number
  elapsedDays: number
}

function* cases(): Generator<Case> {
  for (const cycleDays of CYCLES) {
    for (let elapsedDays = 0; elapsedDays <= cycleDays; elapsedDays++) {
      for (const oldPricePaisa of PRICES) {
        for (const newPricePaisa of PRICES) {
          yield { oldPricePaisa, newPricePaisa, cycleDays, elapsedDays }
        }
      }
    }
  }
}

const ALL = [...cases()]

/** Reports the first failing case rather than just "expected true, got false". */
function forEachCase(
  predicate: (c: Case) => boolean,
  describeFailure: (c: Case) => string
): void {
  for (const c of ALL) {
    if (!predicate(c)) {
      throw new Error(
        `invariant violated for ${JSON.stringify(c)}: ${describeFailure(c)}`
      )
    }
  }
}

describe("computeUpgradeWithinPeriod — invariants over the whole grid", () => {
  it("covers a grid big enough to matter", () => {
    // Guards the sweep itself: a generator bug that yields nothing would make
    // every test below pass vacuously, which is the classic way a property
    // suite goes quietly dead.
    expect(ALL.length).toBeGreaterThan(50_000)
  })

  it("every returned amount is a non-negative integer number of paisa", () => {
    forEachCase(
      (c) => {
        const r = computeUpgradeWithinPeriod(c)
        return (
          Number.isInteger(r.remainingDays) &&
          Number.isInteger(r.unusedCreditPaisa) &&
          Number.isInteger(r.newChargePaisa) &&
          Number.isInteger(r.amountDuePaisa) &&
          r.remainingDays >= 0 &&
          r.unusedCreditPaisa >= 0 &&
          r.newChargePaisa >= 0 &&
          r.amountDuePaisa >= 0
        )
      },
      (c) => `got ${JSON.stringify(computeUpgradeWithinPeriod(c))}`
    )
  })

  it("never credits a school more than it actually paid", () => {
    forEachCase(
      (c) => computeUpgradeWithinPeriod(c).unusedCreditPaisa <= c.oldPricePaisa,
      (c) =>
        `credit ${computeUpgradeWithinPeriod(c).unusedCreditPaisa} > old price ${c.oldPricePaisa}`
    )
  })

  it("never charges more for the remainder than a full new period", () => {
    forEachCase(
      (c) => computeUpgradeWithinPeriod(c).newChargePaisa <= c.newPricePaisa,
      (c) =>
        `charge ${computeUpgradeWithinPeriod(c).newChargePaisa} > new price ${c.newPricePaisa}`
    )
  })

  it("rounds in the platform's favour: floor the credit, ceil the charge (§5.4)", () => {
    // The whole point of the asymmetry. The credit is never rounded UP and the
    // charge is never rounded DOWN, so rounding can never cost us a paisa; the
    // school is out at most ৳0.01, which §5.4 accepts explicitly.
    forEachCase(
      (c) => {
        const r = computeUpgradeWithinPeriod(c)
        const exactCredit = (c.oldPricePaisa * r.remainingDays) / c.cycleDays
        const exactCharge = (c.newPricePaisa * r.remainingDays) / c.cycleDays
        return (
          r.unusedCreditPaisa <= exactCredit &&
          r.unusedCreditPaisa > exactCredit - 1 &&
          r.newChargePaisa >= exactCharge &&
          r.newChargePaisa < exactCharge + 1
        )
      },
      (c) =>
        `rounding went the wrong way: ${JSON.stringify(computeUpgradeWithinPeriod(c))}`
    )
  })

  it("amountDue is exactly newCharge - credit whenever that is positive", () => {
    forEachCase(
      (c) => {
        const r = computeUpgradeWithinPeriod(c)
        const raw = r.newChargePaisa - r.unusedCreditPaisa
        return raw > 0 ? r.amountDuePaisa === raw : r.amountDuePaisa === 0
      },
      (c) =>
        `clamping is wrong: ${JSON.stringify(computeUpgradeWithinPeriod(c))}`
    )
  })

  it("a same-price change is always free, on any day of any cycle", () => {
    // Re-snapshotting a school onto the same price (§5.3) must never produce a
    // charge from rounding drift alone.
    for (const cycleDays of CYCLES) {
      for (let elapsedDays = 0; elapsedDays <= cycleDays; elapsedDays++) {
        for (const price of PRICES) {
          const r = computeUpgradeWithinPeriod({
            oldPricePaisa: price,
            newPricePaisa: price,
            cycleDays,
            elapsedDays,
          })
          // floor(x) and ceil(x) differ by at most 1 paisa when x is fractional.
          expect(r.amountDuePaisa).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it("the unused credit never grows as more of the cycle is consumed", () => {
    for (const cycleDays of CYCLES) {
      for (const oldPricePaisa of PRICES) {
        let previous = Number.POSITIVE_INFINITY
        for (let elapsedDays = 0; elapsedDays <= cycleDays; elapsedDays++) {
          const { unusedCreditPaisa } = computeUpgradeWithinPeriod({
            oldPricePaisa,
            newPricePaisa: 0,
            cycleDays,
            elapsedDays,
          })
          expect(unusedCreditPaisa).toBeLessThanOrEqual(previous)
          previous = unusedCreditPaisa
        }
        // By the end of the cycle there is nothing left to credit.
        expect(previous).toBe(0)
      }
    }
  })

  it("rejects every non-integer or negative money argument", () => {
    const bad = [-1, 0.5, 220_000.01, Number.NaN, Number.POSITIVE_INFINITY]
    for (const value of bad) {
      expect(() =>
        computeUpgradeWithinPeriod({
          oldPricePaisa: value,
          newPricePaisa: 490_000,
          cycleDays: 30,
          elapsedDays: 12,
        })
      ).toThrow(RangeError)
      expect(() =>
        computeUpgradeWithinPeriod({
          oldPricePaisa: 220_000,
          newPricePaisa: value,
          cycleDays: 30,
          elapsedDays: 12,
        })
      ).toThrow(RangeError)
    }
  })
})

describe("computeMonthlyToYearlyUpgrade — invariants", () => {
  it("is the full yearly price minus the same monthly credit, never negative", () => {
    for (const cycleDays of [28, 30, 31]) {
      for (let elapsedDays = 0; elapsedDays <= cycleDays; elapsedDays++) {
        for (const oldMonthlyPricePaisa of PRICES) {
          for (const newYearlyPricePaisa of PRICES) {
            const r = computeMonthlyToYearlyUpgrade({
              oldMonthlyPricePaisa,
              newYearlyPricePaisa,
              cycleDays,
              elapsedDays,
            })
            const within = computeUpgradeWithinPeriod({
              oldPricePaisa: oldMonthlyPricePaisa,
              newPricePaisa: 0,
              cycleDays,
              elapsedDays,
            })
            expect(r.unusedCreditPaisa).toBe(within.unusedCreditPaisa)
            expect(Number.isInteger(r.amountDuePaisa)).toBe(true)
            expect(r.amountDuePaisa).toBe(
              Math.max(newYearlyPricePaisa - within.unusedCreditPaisa, 0)
            )
            expect(r.amountDuePaisa).toBeLessThanOrEqual(newYearlyPricePaisa)
          }
        }
      }
    }
  })

  it("validates the yearly price rather than passing it through unchecked", () => {
    // Regression guard: the delegated call passes `newPricePaisa: 0`, so the
    // yearly price is the one money argument the inner function never sees.
    for (const value of [-1, 0.5, 5_390_000.5, Number.NaN]) {
      expect(() =>
        computeMonthlyToYearlyUpgrade({
          oldMonthlyPricePaisa: 490_000,
          newYearlyPricePaisa: value,
          cycleDays: 30,
          elapsedDays: 12,
        })
      ).toThrow(RangeError)
    }
  })

  it("matches the seeded 11x yearly relationship end to end (D-41)", () => {
    // Pro monthly ৳4,900 -> Pro yearly ৳53,900 on day 12 of a 30-day cycle.
    const r = computeMonthlyToYearlyUpgrade({
      oldMonthlyPricePaisa: 490_000,
      newYearlyPricePaisa: 5_390_000,
      cycleDays: 30,
      elapsedDays: 12,
    })
    expect(r.remainingDays).toBe(18)
    expect(r.unusedCreditPaisa).toBe(Math.floor((490_000 * 18) / 30))
    expect(r.unusedCreditPaisa).toBe(294_000)
    expect(r.amountDuePaisa).toBe(5_390_000 - 294_000)
  })
})

describe("computeFullPriceUpgrade — invariants", () => {
  it("is always the full price with no credit, and validates its input", () => {
    for (const price of PRICES) {
      expect(computeFullPriceUpgrade(price)).toEqual({
        unusedCreditPaisa: 0,
        amountDuePaisa: price,
      })
    }
    for (const value of [-1, 0.5, Number.NaN]) {
      expect(() => computeFullPriceUpgrade(value)).toThrow(RangeError)
    }
  })
})
