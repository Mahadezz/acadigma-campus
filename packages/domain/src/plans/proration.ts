/**
 * Proration on plan change (F-CM-06 §5.4, §5.5) — the exact arithmetic, in paisa,
 * server-side only. All amounts are `Paisa` (`packages/domain/money`); nothing here
 * rounds a taka figure, because that is exactly how a paisa gets lost.
 *
 * "Floor the credit, ceil the charge" (§5.4): the platform never loses a paisa to
 * rounding, and the worst case is the school being owed at most ৳0.01 it will never
 * notice. Downgrades (§5.5) are the opposite of prorated — no credit, no refund,
 * ever — so `computeDowngrade` below is one line that always returns zero, kept as
 * a named function so a call site reads as a decision rather than a magic 0.
 */

import type { Paisa } from "../money"

export type UpgradeWithinPeriodInput = {
  /** What the school is actually paying today (`subscriptions.price_paisa_snapshot`). */
  oldPricePaisa: Paisa
  /** The target plan/period's price. */
  newPricePaisa: Paisa
  /** Length of the current billing cycle in days (30, 31, 365…). */
  cycleDays: number
  /** Days elapsed in the current cycle at the moment of upgrade. */
  elapsedDays: number
}

export type ProrationResult = {
  remainingDays: number
  unusedCreditPaisa: Paisa
  newChargePaisa: Paisa
  amountDuePaisa: Paisa
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a non-negative integer, got ${value}`
    )
  }
}

/**
 * Upgrade within the same period length (monthly→monthly or yearly→yearly),
 * §5.4's worked example: Pro ৳7,999 from Starter ৳2,999, 30-day cycle, 12 days
 * elapsed → remaining 18 → unused credit ৳1,799.40, new charge ৳4,799.40, amount
 * due ৳3,000.00 exactly. `current_period_end` does not move; only the price
 * snapshot changes, so the next renewal is the full new price (§5.4).
 */
export function computeUpgradeWithinPeriod(
  input: UpgradeWithinPeriodInput
): ProrationResult {
  assertNonNegativeInteger(input.oldPricePaisa, "oldPricePaisa")
  assertNonNegativeInteger(input.newPricePaisa, "newPricePaisa")
  if (!Number.isInteger(input.cycleDays) || input.cycleDays <= 0) {
    throw new RangeError(
      `cycleDays must be a positive integer, got ${input.cycleDays}`
    )
  }
  assertNonNegativeInteger(input.elapsedDays, "elapsedDays")

  const remainingDays = Math.max(input.cycleDays - input.elapsedDays, 0)
  const unusedCreditPaisa = Math.floor(
    (input.oldPricePaisa * remainingDays) / input.cycleDays
  )
  const newChargePaisa = Math.ceil(
    (input.newPricePaisa * remainingDays) / input.cycleDays
  )
  const amountDuePaisa = Math.max(newChargePaisa - unusedCreditPaisa, 0)

  return { remainingDays, unusedCreditPaisa, newChargePaisa, amountDuePaisa }
}

export type MonthlyToYearlyUpgradeInput = {
  oldMonthlyPricePaisa: Paisa
  newYearlyPricePaisa: Paisa
  cycleDays: number
  elapsedDays: number
}

/**
 * Monthly→yearly upgrade (§5.4): the unused monthly credit is computed exactly as
 * `computeUpgradeWithinPeriod` and deducted from the full yearly price. The caller
 * sets `current_period_end = now() + 1 year` — that date arithmetic is not this
 * function's concern, only the amount due is.
 */
export function computeMonthlyToYearlyUpgrade(
  input: MonthlyToYearlyUpgradeInput
): { remainingDays: number; unusedCreditPaisa: Paisa; amountDuePaisa: Paisa } {
  // The delegated call below passes `newPricePaisa: 0`, so it validates the OLD
  // price and never sees this one — the only money argument in this file that
  // would otherwise reach an arithmetic result unchecked. `plan_prices.yearly_paisa`
  // is platform-staff editable, so a bad value here is an input, not a theory.
  assertNonNegativeInteger(input.newYearlyPricePaisa, "newYearlyPricePaisa")

  const { remainingDays, unusedCreditPaisa } = computeUpgradeWithinPeriod({
    oldPricePaisa: input.oldMonthlyPricePaisa,
    // newPricePaisa/newChargePaisa are unused for this shape — only the credit
    // half of the same formula is needed, so 0 keeps the call honest.
    newPricePaisa: 0,
    cycleDays: input.cycleDays,
    elapsedDays: input.elapsedDays,
  })
  const amountDuePaisa = Math.max(
    input.newYearlyPricePaisa - unusedCreditPaisa,
    0
  )
  return { remainingDays, unusedCreditPaisa, amountDuePaisa }
}

/**
 * Upgrading from `trialing`, `past_due` or `lapsed` (§5.4): no credit, because
 * nothing has been paid for the days being given up. Full price for a full period.
 */
export function computeFullPriceUpgrade(newPricePaisa: Paisa): {
  unusedCreditPaisa: Paisa
  amountDuePaisa: Paisa
} {
  assertNonNegativeInteger(newPricePaisa, "newPricePaisa")
  return { unusedCreditPaisa: 0, amountDuePaisa: newPricePaisa }
}

/**
 * Downgrades and period shortenings (§5.5): no proration, no refund, ever. Kept as a
 * named function — rather than callers writing a literal `0` — so "no refund" reads
 * as a deliberate rule at the call site, not an oversight.
 */
export function computeDowngrade(): { amountDuePaisa: Paisa } {
  return { amountDuePaisa: 0 }
}
