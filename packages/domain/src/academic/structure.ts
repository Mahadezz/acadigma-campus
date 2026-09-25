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

const LATIN_LETTERS = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i)
)
/** Bangla-medium schools name sections ক, খ, গ … */
const BANGLA_LETTERS = [
  "ক",
  "খ",
  "গ",
  "ঘ",
  "ঙ",
  "চ",
  "ছ",
  "জ",
  "ঝ",
  "ঞ",
  "ট",
  "ঠ",
  "ড",
  "ঢ",
  "ণ",
  "ত",
  "থ",
  "দ",
  "ধ",
  "ন",
  "প",
  "ফ",
  "ব",
  "ভ",
  "ম",
]

/** The next free letter for a new section of a grade (A, B … or ক, খ …
 * in Bangla), or "" when every letter is taken. */
export function nextSectionName(
  existing: readonly string[],
  locale: "en" | "bn" = "en"
): string {
  const taken = new Set(existing.map((name) => name.trim().toUpperCase()))
  const letters = locale === "bn" ? BANGLA_LETTERS : LATIN_LETTERS
  return letters.find((letter) => !taken.has(letter)) ?? ""
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
const core = (code: string, name: string, name_bn: string): StarterSubject => ({
  code,
  name,
  name_bn,
  category: "core",
  subject_kind: "compulsory",
})
const religion = (
  code: string,
  name: string,
  name_bn: string
): StarterSubject => ({
  code,
  name,
  name_bn,
  category: "religion",
  subject_kind: "compulsory",
})
const fourth = (
  code: string,
  name: string,
  name_bn: string
): StarterSubject => ({
  code,
  name,
  name_bn,
  category: "optional",
  subject_kind: "optional_fourth",
})

/**
 * §3 "Seeds": the NCTB starter catalogue, copied into a school's own
 * `subjects` rows (never referenced across tenants). Bangla and English are
 * two papers each because marks are kept per paper; religion is one
 * subject per faith; Agriculture, Home Science and Higher Mathematics are
 * the usual fourth subjects.
 */
export const NCTB_STARTER_SUBJECTS: readonly StarterSubject[] = [
  core("BAN1", "Bangla 1st Paper", "বাংলা প্রথম পত্র"),
  core("BAN2", "Bangla 2nd Paper", "বাংলা দ্বিতীয় পত্র"),
  core("ENG1", "English 1st Paper", "ইংরেজি প্রথম পত্র"),
  core("ENG2", "English 2nd Paper", "ইংরেজি দ্বিতীয় পত্র"),
  core("MATH", "Mathematics", "গণিত"),
  core("SCI", "Science", "বিজ্ঞান"),
  core("BGS", "Bangladesh & Global Studies", "বাংলাদেশ ও বিশ্বপরিচয়"),
  core("ICT", "ICT", "তথ্য ও যোগাযোগ প্রযুক্তি"),
  religion("ISL", "Islam and Moral Education", "ইসলাম ও নৈতিক শিক্ষা"),
  religion(
    "HIN",
    "Hindu Religion and Moral Education",
    "হিন্দুধর্ম ও নৈতিক শিক্ষা"
  ),
  religion(
    "BUD",
    "Buddhist Religion and Moral Education",
    "বৌদ্ধধর্ম ও নৈতিক শিক্ষা"
  ),
  religion(
    "CHR",
    "Christian Religion and Moral Education",
    "খ্রিষ্টধর্ম ও নৈতিক শিক্ষা"
  ),
  {
    code: "PEH",
    name: "Physical Education and Health",
    name_bn: "শারীরিক শিক্ষা ও স্বাস্থ্য",
    category: "co_curricular",
    subject_kind: "compulsory",
  },
  fourth("AGRI", "Agriculture", "কৃষিশিক্ষা"),
  fourth("HSCI", "Home Science", "গার্হস্থ্য বিজ্ঞান"),
  fourth("HMATH", "Higher Mathematics", "উচ্চতর গণিত"),
  core("PHY", "Physics", "পদার্থবিজ্ঞান"),
  core("CHEM", "Chemistry", "রসায়ন"),
  core("BIO", "Biology", "জীববিজ্ঞান"),
  core("ACC", "Accounting", "হিসাববিজ্ঞান"),
  core("BENT", "Business Entrepreneurship", "ব্যবসায় উদ্যোগ"),
  core("ECON", "Economics", "অর্থনীতি"),
]
