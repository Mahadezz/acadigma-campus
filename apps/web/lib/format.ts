import { toIntlLocale, type Locale } from "./locale"

/** "m…@gmail.com" — F-ID-01 §4.1: "We sent a link to _m…@gmail.com_". Pure
 * display formatting, not a business rule, so it lives beside the other
 * presentation helpers rather than in packages/domain. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const visible = local.slice(0, 1)
  return `${visible}…@${domain}`
}

/** "29 Oct 2026" / "29 অক্টো, 2026" (Western digits, DESIGN-SYSTEM §1.6) in Bangladesh time — the day a
 * scheduled account deletion happens (F-ID-01 §4.9 banner). */
export function formatDhakaDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso))
}

/** "September 2026" — a `YYYY-MM` string (F-OP-07 Part 3's attendance-policy
 * preview month) in the reader's language, never the raw ISO fragment. */
export function formatMonthYear(isoMonth: string, locale: Locale): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(`${isoMonth}-01T00:00:00Z`))
}
