import type { AttendanceDaySection } from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"

import type { Locale } from "@/lib/locale"

/** "Class 6 – ক" in the reader's language. Not in a "use client" module, so
 * both the server pages and the client views can call it. */
export function sectionLabel(locale: Locale, s: AttendanceDaySection): string {
  const grade = locale === "bn" ? (s.gradeNameBn ?? s.gradeName) : s.gradeName
  return sectionDisplayName(grade, s.sectionName)
}

/** Fills `{name}` placeholders. */
export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? "")
  )
}
