/**
 * Money is integer paisa (ARCHITECTURE §4). Floats never touch an amount: ৳0.10
 * three times is 30 paisa here and 30.000000000000004 in IEEE-754, and the second
 * answer eventually shows up on an invoice.
 *
 * Percentages arrive as basis points (3000 bp = 30 %), matching the commission
 * stored in `platform_settings` (DECISION-LOG D-15).
 */

export const PAISA_PER_TAKA = 100
export const BASIS_POINTS_SCALE = 10_000
export const TAKA_SIGN = "৳"

/** Amounts in whole paisa. A branded alias would fight JSON; the name carries it. */
export type Paisa = number

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MoneyError"
  }
}

function assertPaisa(value: number, label = "amount"): asserts value is Paisa {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `${label} must be a whole number of paisa, got ${value}`
    )
  }
}

/** ৳12.34 → 1234 paisa. Rounds half away from zero, because ৳0.005 is a typo. */
export function takaToPaisa(taka: number): Paisa {
  if (!Number.isFinite(taka)) {
    throw new MoneyError(`Cannot convert ${taka} taka to paisa`)
  }
  const scaled = taka * PAISA_PER_TAKA
  return Math.sign(scaled) * Math.round(Math.abs(scaled))
}

/** 1234 paisa → 12.34. Only for display and chart axes — never for arithmetic. */
export function paisaToTaka(paisa: Paisa): number {
  assertPaisa(paisa)
  return paisa / PAISA_PER_TAKA
}

export function addPaisa(...amounts: Paisa[]): Paisa {
  let total = 0
  for (const amount of amounts) {
    assertPaisa(amount)
    total += amount
  }
  assertPaisa(total, "total")
  return total
}

export function subtractPaisa(minuend: Paisa, subtrahend: Paisa): Paisa {
  assertPaisa(minuend)
  assertPaisa(subtrahend)
  return minuend - subtrahend
}

/** Line total: unit price × quantity. Quantity must be a non-negative integer. */
export function multiplyPaisa(amount: Paisa, quantity: number): Paisa {
  assertPaisa(amount)
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(
      `Quantity must be a non-negative integer, got ${quantity}`
    )
  }
  const total = amount * quantity
  assertPaisa(total, "line total")
  return total
}

/**
 * Applies a basis-point rate, rounding half up. Used for commission, VAT and
 * discounts — always server-side (DECISION-LOG D-06).
 */
export function applyBasisPoints(amount: Paisa, basisPoints: number): Paisa {
  assertPaisa(amount)
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > BASIS_POINTS_SCALE
  ) {
    throw new MoneyError(
      `Basis points must be an integer between 0 and ${BASIS_POINTS_SCALE}, got ${basisPoints}`
    )
  }
  return Math.round((amount * basisPoints) / BASIS_POINTS_SCALE)
}

/**
 * Splits a sale into the platform's cut and the seller's earning. The seller takes
 * the remainder rather than a second rounded multiplication, so the two halves
 * always add back up to the gross exactly — no stray paisa in the ledger.
 */
export function splitCommission(
  gross: Paisa,
  platformBasisPoints: number
): { platform: Paisa; seller: Paisa } {
  const platform = applyBasisPoints(gross, platformBasisPoints)
  return { platform, seller: subtractPaisa(gross, platform) }
}

/**
 * Distributes an amount across `parts` shares whose sum equals the original.
 * Leftover paisa go to the earliest shares — the standard "largest remainder to
 * the front" rule, so ৳10 across 3 instalments is 334 + 333 + 333.
 */
export function allocatePaisa(amount: Paisa, parts: number): Paisa[] {
  assertPaisa(amount)
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`Parts must be a positive integer, got ${parts}`)
  }
  const base = Math.trunc(amount / parts)
  const remainder = amount - base * parts
  return Array.from({ length: parts }, (_, index) =>
    index < Math.abs(remainder) ? base + Math.sign(remainder) : base
  )
}

export type FormatMoneyOptions = {
  /** Drop `.00` on whole-taka amounts. Defaults to false — invoices want both. */
  compactWholeTaka?: boolean
  /** Omit the ৳ sign, e.g. inside a column already headed "Amount (৳)". */
  omitSign?: boolean
  /** BCP-47 locale for grouping and digits. `bn-BD` renders Bengali numerals. */
  locale?: string
}

/**
 * Renders paisa for a human: `formatTaka(123456)` → `৳1,234.56`.
 *
 * Intl.NumberFormat with `currency: "BDT"` gives "BDT 1,234.56" or "৳1,234.56"
 * depending on the runtime's CLDR data, which makes snapshots flaky across Node
 * versions. Formatting the number and prefixing the sign ourselves is stable.
 */
export function formatTaka(
  paisa: Paisa,
  options: FormatMoneyOptions = {}
): string {
  assertPaisa(paisa)
  const {
    compactWholeTaka = false,
    omitSign = false,
    locale = "en-BD",
  } = options
  const isWhole = paisa % PAISA_PER_TAKA === 0
  const fractionDigits = compactWholeTaka && isWhole ? 0 : 2

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(paisa) / PAISA_PER_TAKA)

  const sign = paisa < 0 ? "-" : ""
  return omitSign ? `${sign}${formatted}` : `${sign}${TAKA_SIGN}${formatted}`
}
