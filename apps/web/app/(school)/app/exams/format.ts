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
