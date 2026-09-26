import type { BasicHomeClass } from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"

import type { Locale } from "@/lib/locale"

/** Fills `{name}` placeholders (mirrors `../attendance/format.ts`'s `fill`,
 * kept local to this route the same way that one is — no shared cross-route
 * helper exists in this codebase yet). */
export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? "")
  )
}

/** "Class 6 – ক · Bangla" / "Class 6 – ক · Class teacher" (§4.4.2). */
export function classBlockTitle(
  locale: Locale,
  cls: Pick<
    BasicHomeClass,
    "gradeName" | "gradeNameBn" | "sectionName" | "subject" | "subjectBn"
  >,
  classTeacherLabel: string
): string {
  const grade =
    locale === "bn" ? (cls.gradeNameBn ?? cls.gradeName) : cls.gradeName
  const section = sectionDisplayName(grade, cls.sectionName)
  const subject =
    (locale === "bn" ? (cls.subjectBn ?? cls.subject) : cls.subject) ??
    classTeacherLabel
  return `${section} · ${subject}`
}

/** English "1 student" / "40 students"; Bangla has one form for any count
 * (both `studentCountOne`/`studentCountOther` hold the same string there). */
export function pluralize(count: number, one: string, other: string): string {
  return fill(count === 1 ? one : other, { count })
}
