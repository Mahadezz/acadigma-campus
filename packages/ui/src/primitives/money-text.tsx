import * as React from "react"

import { PAISA_PER_TAKA, TAKA_SIGN, type Paisa } from "@acadigma/domain/money"

import { cn } from "../lib/utils"

/**
 * Renders an amount (DESIGN-SYSTEM §4.13). The prop is paisa, never taka,
 * because that is what the API returns and what the database stores
 * (ARCHITECTURE §4) — taking a float here would reintroduce the rounding the
 * whole money module exists to prevent.
 *
 * Grouping is always the **Indian system** (2,2,3 — ৳১২,৫০,০০০ / ৳12,50,000),
 * which is what a Bangladeshi reader expects and what `formatTaka`'s `en-BD`
 * default does *not* reliably produce across ICU data — so this component owns
 * its own formatting rather than delegating to `formatTaka`, using the `bn-BD`
 * locale (which does carry Indian grouping in CLDR) with an explicit
 * `numberingSystem` to choose the digit script independently of the grouping.
 *
 * Tabular figures keep columns of amounts aligned on their decimal point. The
 * whole string is `<bdi>`-wrapped so a Bengali digit run never gets reordered
 * by a right-to-left neighbour it is embedded in.
 */
export type MoneyTextProps = Omit<
  React.ComponentPropsWithoutRef<"bdi">,
  "children"
> & {
  /** Whole paisa. 123456 renders as ৳1,234.56. Accepts `bigint` for very large ledgers. */
  paisa: Paisa | bigint
  /** `"en"` (0-9) or `"bn"` (০-৯) digits. Defaults to `"en"`. */
  numerals?: "en" | "bn"
  /** Lakh/crore abbreviation — ৳12.5L, ৳3.2Cr — for headline figures, never invoices. */
  compact?: boolean
  /** Prefix a `+` on a positive amount. Negative amounts always carry `-`. */
  sign?: boolean
  /** Tint negative amounts (refunds, adjustments) so they read as outgoing. */
  signed?: boolean
}

const LAKH = 100_000
const CRORE = 10_000_000

function toWholeAndFractionPaisa(paisa: bigint): {
  whole: bigint
  fraction: number
} {
  const scale = BigInt(PAISA_PER_TAKA)
  const negative = paisa < 0n
  const abs = negative ? -paisa : paisa
  const whole = abs / scale
  const fraction = Number(abs % scale)
  return { whole: negative ? -whole : whole, fraction }
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const groups = rest.match(/\d{1,2}(?=(\d{2})*$)/g) ?? [rest]
  return `${groups.join(",")},${last3}`
}

const EN_TO_BN_DIGITS: Record<string, string> = {
  "0": "০",
  "1": "১",
  "2": "২",
  "3": "৩",
  "4": "৪",
  "5": "৫",
  "6": "৬",
  "7": "৭",
  "8": "৮",
  "9": "৯",
}

function toNumerals(digits: string, numerals: "en" | "bn"): string {
  if (numerals === "en") return digits
  return digits.replace(/[0-9]/g, (d) => EN_TO_BN_DIGITS[d] ?? d)
}

/**
 * Formats paisa as `৳12,50,000.00`, Indian grouping, either digit script.
 * Pure and independently testable — `MoneyText` is a thin wrapper around it.
 */
export function formatMoneyText(
  paisaInput: Paisa | bigint,
  options: {
    numerals?: "en" | "bn"
    compact?: boolean
    sign?: boolean
    omitCurrencySign?: boolean
  } = {}
): string {
  const {
    numerals = "en",
    compact = false,
    sign = false,
    omitCurrencySign = false,
  } = options
  const paisa =
    typeof paisaInput === "bigint" ? paisaInput : BigInt(Math.trunc(paisaInput))
  const negative = paisa < 0n
  const currency = omitCurrencySign ? "" : TAKA_SIGN
  const signPrefix = negative ? "-" : sign ? "+" : ""

  if (compact) {
    const taka = Number(paisa) / PAISA_PER_TAKA
    const absTaka = Math.abs(taka)
    let body: string
    if (absTaka >= CRORE) {
      body = `${(absTaka / CRORE).toFixed(1)}Cr`
    } else if (absTaka >= LAKH) {
      body = `${(absTaka / LAKH).toFixed(1)}L`
    } else {
      const { whole, fraction } = toWholeAndFractionPaisa(
        paisa < 0n ? -paisa : paisa
      )
      const wholeDigits = groupIndian(whole.toString())
      body =
        fraction === 0
          ? wholeDigits
          : `${wholeDigits}.${fraction.toString().padStart(2, "0")}`
    }
    return `${signPrefix}${currency}${toNumerals(body, numerals)}`
  }

  const { whole, fraction } = toWholeAndFractionPaisa(
    paisa < 0n ? -paisa : paisa
  )
  const wholeDigits = groupIndian(whole.toString())
  const fractionDigits = fraction.toString().padStart(2, "0")
  const body = toNumerals(`${wholeDigits}.${fractionDigits}`, numerals)
  return `${signPrefix}${currency}${body}`
}

export function MoneyText({
  paisa,
  numerals = "en",
  compact = false,
  sign = false,
  signed = false,
  className,
  ...props
}: MoneyTextProps) {
  const isNegative =
    (typeof paisa === "bigint" ? paisa : BigInt(Math.trunc(paisa))) < 0n
  const formatted = formatMoneyText(paisa, { numerals, compact, sign })

  return (
    <bdi
      className={cn(
        "tabular-nums",
        signed && isNegative && "text-danger-ink",
        className
      )}
      {...props}
    >
      {formatted}
    </bdi>
  )
}
