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

/**
 * "Class 6 – ক · Bangla" / "Class 6 – ক · Class teacher" / "Class 6 – ক ·
 * Class teacher, Bangla, English" (§4.4.2) — `listMySections` (D-107)
 * already groups "class teacher" and "every subject taught here" into one
 * `BasicHomeClass`, so this only joins the labels, it does not decide which
 * ones apply.
 */
export function classBlockTitle(
  locale: Locale,
  cls: Pick<
    BasicHomeClass,
    "gradeName" | "gradeNameBn" | "sectionName" | "isClassTeacher" | "subjects"
  >,
  classTeacherLabel: string
): string {
  const grade = locale === "bn" ? cls.gradeNameBn : cls.gradeName
  const section = sectionDisplayName(grade, cls.sectionName)
  const subjectNames = cls.subjects.map((s) =>
    locale === "bn" ? (s.nameBn ?? s.name) : s.name
  )
  const labels = cls.isClassTeacher
    ? [classTeacherLabel, ...subjectNames]
    : subjectNames
  return `${section} · ${labels.join(", ")}`
}

/** English "1 student" / "40 students"; Bangla has one form for any count
 * (both `studentCountOne`/`studentCountOther` hold the same string there). */
export function pluralize(count: number, one: string, other: string): string {
  return fill(count === 1 ? one : other, { count })
}
