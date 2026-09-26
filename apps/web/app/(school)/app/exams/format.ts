import type { Locale } from "@/lib/locale"

/**
 * Exam dates are calendar dates (no time), so they are formatted as UTC
 * midnight to keep the day from shifting; Western digits in Bengali too
 * (DESIGN-SYSTEM §1.6: bn-BD-u-nu-latn).
 */
export function examDateFormatter(locale: Locale): (iso: string) => string {
  const format = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
  )
  return (iso) => format.format(new Date(`${iso}T00:00:00Z`))
}

export function dateRange(
  fmt: (iso: string) => string,
  startsOn: string | null,
  endsOn: string | null
): string {
  if (startsOn && endsOn) return `${fmt(startsOn)} – ${fmt(endsOn)}`
  return startsOn ? fmt(startsOn) : endsOn ? fmt(endsOn) : ""
}

/**
 * Today's calendar date (ISO) in Asia/Dhaka, the default school timezone.
 * ponytail: the database decides by the school's own zone (app.school_today);
 * this only picks what the screen shows.
 */
export function schoolToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(
    new Date()
  )
}
