import type { SubjectCategory, SubjectKind } from "@acadigma/contracts"

/**
 * F-AC-01 §5 rules 4-5 and §3 "Seeds" — pure helpers for the academic
 * structure screens. No I/O.
 */

/** §5 rule 4: "Class 6 – A" (en dash). The one place a section label is built. */
export function sectionDisplayName(
  gradeName: string,
  sectionName: string
): string {
  return `${gradeName} – ${sectionName}`
}

/** The next free letter for a new section of a grade: A, B, … Z, then "". */
export function nextSectionName(existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toUpperCase()))
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    if (!taken.has(letter)) return letter
  }
  return ""
}

export type StarterSubject = {
  code: string
  name: string
  name_bn: string
  category: SubjectCategory
  subject_kind: SubjectKind
}

/**
 * §3 "Seeds": the NCTB starter catalogue, copied into a school's own
 * `subjects` rows (never referenced across tenants). Higher Mathematics and
 * Agriculture are the usual Bangladesh fourth subjects.
 */
export const NCTB_STARTER_SUBJECTS: readonly StarterSubject[] = [
  { code: "BAN", name: "Bangla", name_bn: "বাংলা", category: "core", subject_kind: "compulsory" },
  { code: "ENG", name: "English", name_bn: "ইংরেজি", category: "core", subject_kind: "compulsory" },
  { code: "MATH", name: "Mathematics", name_bn: "গণিত", category: "core", subject_kind: "compulsory" },
  { code: "SCI", name: "Science", name_bn: "বিজ্ঞান", category: "core", subject_kind: "compulsory" },
  { code: "BGS", name: "Bangladesh & Global Studies", name_bn: "বাংলাদেশ ও বিশ্বপরিচয়", category: "core", subject_kind: "compulsory" },
  { code: "ICT", name: "ICT", name_bn: "তথ্য ও যোগাযোগ প্রযুক্তি", category: "core", subject_kind: "compulsory" },
  { code: "REL", name: "Religion & Moral Education", name_bn: "ধর্ম ও নৈতিক শিক্ষা", category: "religion", subject_kind: "compulsory" },
  { code: "PE", name: "Physical Education", name_bn: "শারীরিক শিক্ষা", category: "co_curricular", subject_kind: "compulsory" },
  { code: "AGRI", name: "Agriculture", name_bn: "কৃষিশিক্ষা", category: "optional", subject_kind: "optional_fourth" },
  { code: "HSCI", name: "Home Science", name_bn: "গার্হস্থ্য বিজ্ঞান", category: "optional", subject_kind: "optional_fourth" },
  { code: "HMATH", name: "Higher Mathematics", name_bn: "উচ্চতর গণিত", category: "optional", subject_kind: "optional_fourth" },
  { code: "PHY", name: "Physics", name_bn: "পদার্থবিজ্ঞান", category: "core", subject_kind: "compulsory" },
  { code: "CHEM", name: "Chemistry", name_bn: "রসায়ন", category: "core", subject_kind: "compulsory" },
  { code: "BIO", name: "Biology", name_bn: "জীববিজ্ঞান", category: "core", subject_kind: "compulsory" },
  { code: "ACC", name: "Accounting", name_bn: "হিসাববিজ্ঞান", category: "core", subject_kind: "compulsory" },
  { code: "BENT", name: "Business Entrepreneurship", name_bn: "ব্যবসায় উদ্যোগ", category: "core", subject_kind: "compulsory" },
  { code: "ECON", name: "Economics", name_bn: "অর্থনীতি", category: "core", subject_kind: "compulsory" },
]
