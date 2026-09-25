import type { RosterStudent } from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

/** "Class 6 – ক", in the reader's language, or "Not enrolled". Shared by
 * the roster (client) and the profile (server), so it is not in a
 * "use client" module. */
export function classLabel(
  t: Messages["students"],
  locale: Locale,
  s: RosterStudent
): string {
  const grade = locale === "bn" ? (s.gradeNameBn ?? s.gradeName) : s.gradeName
  return grade && s.sectionName
    ? sectionDisplayName(grade, s.sectionName)
    : t.notEnrolled
}
