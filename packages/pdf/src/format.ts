/**
 * F-OP-03 §3.6 / §5.7(6) — the one place a number or date becomes text on a
 * printed page. No template formats a number itself; every printed number and
 * date goes through one of these two functions.
 *
 * Report locale is independent of DESIGN-SYSTEM §1.6's screen rule ("digits
 * default to Western, even in Bengali UI"): a printed report card is allowed
 * to opt into Bengali numerals wholesale (the same opt-in `<MoneyText
 * numerals="bn">` exposes on screen), because a report that goes home with a
 * child is read by a parent, not typed into a keypad.
 */
/** Mirrors `public.report_locale` (parity asserted in `@acadigma/contracts`). */
export type ReportLocale = "bn" | "en"

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const

function toBengaliDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => BN_DIGITS[Number(digit)] ?? digit)
}

/**
 * `value` formatted with a fixed number of decimal places (Western digits by
 * default), Bengali digits substituted in when `locale === 'bn'`. Negative
 * numbers keep a plain `-` sign in both locales (Bengali has no separate
 * minus glyph in general use here).
 */
export function formatNumber(
  value: number,
  locale: ReportLocale,
  fractionDigits = 0
): string {
  if (!Number.isFinite(value)) return "—"
  const fixed = value.toFixed(fractionDigits)
  return locale === "bn" ? toBengaliDigits(fixed) : fixed
}

/**
 * `date` as `DD/MM/YYYY` (the format every school office already uses on
 * paper), digits per locale. Accepts a `Date` or an ISO string.
 */
export function formatDate(date: Date | string, locale: ReportLocale): string {
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "—"
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = String(d.getUTCFullYear())
  const out = `${dd}/${mm}/${yyyy}`
  return locale === "bn" ? toBengaliDigits(out) : out
}

/** `date` as `DD/MM/YYYY, HH:MM` for the footer's "Generated {date} {time}". */
export function formatDateTime(
  date: Date | string,
  locale: ReportLocale
): string {
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "—"
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const min = String(d.getUTCMinutes()).padStart(2, "0")
  const out = `${formatDate(d, "en")}, ${hh}:${min}`
  return locale === "bn" ? toBengaliDigits(out) : out
}
