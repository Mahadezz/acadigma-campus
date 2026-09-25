import type { ReportCardDto, ReportCardSubjectRow } from "@acadigma/contracts"
import { bandFor, BD_GRADE_BANDS, roundHalfUp } from "@acadigma/domain/grading"

/**
 * F-OP-03 Part 3 (D-206) — a 40-student Class 6-ক fixture, in the style of
 * `supabase/seed/demo-class-6-ka.sql` (D-103: "40 fictional students"), so
 * the report card template has realistic data to render before F-AC-06's
 * marks entry (Part 3, building in the billing lane right now) lands on
 * `main`. Every letter/grade point/GPA/rank below is computed here with the
 * SAME grade scale the rest of the product uses — `bandFor`/`BD_GRADE_BANDS`
 * from `@acadigma/domain` (#46, D-302) — never re-derived in `packages/pdf`
 * (spec §5.1).
 *
 * `FIXTURE_STUDENT_IDS[i]` / `FIXTURE_EXAM_ID` are stable, fixed uuids so
 * `ReportCardParams` (real `studentId`/`examId` shape) can already be
 * exercised end to end. `getReportCardData` (`report-card-data.ts`) is the
 * one seam that looks these up; nothing else in the render path should
 * import this file directly.
 */

export const FIXTURE_EXAM_ID = "00000000-6000-4000-9000-000000000000"

export const FIXTURE_STUDENT_IDS: readonly string[] = Array.from(
  { length: 40 },
  (_, i) => `00000000-6000-4000-8000-${String(i + 1).padStart(12, "0")}`
)

// Kept as one locale-invariant string on the DTO (no className bn/en split
// in the contract) — "Class 6" reads fine in both languages on a form full
// of Bengali labels, same as a roll number or an EIIN.
const CLASS_NAME_EN = "Class 6"
const SECTION_NAME = "ক"
const EXAM_NAME_EN = "Half-Yearly Examination 2026"
const EXAM_NAME_BN = "অর্ধ-বার্ষিক পরীক্ষা ২০২৬"
const ATTENDANCE_TOTAL_DAYS = 22
const ATTENDANCE_MIN_PERCENT = 75

const SUBJECTS: readonly { en: string; bn: string; fullMarks: number }[] = [
  { en: "Bangla", bn: "বাংলা", fullMarks: 100 },
  { en: "English", bn: "ইংরেজি", fullMarks: 100 },
  { en: "Mathematics", bn: "গণিত", fullMarks: 100 },
  { en: "Science", bn: "বিজ্ঞান", fullMarks: 100 },
  {
    en: "Bangladesh and Global Studies",
    bn: "বাংলাদেশ ও বিশ্বপরিচয়",
    fullMarks: 100,
  },
  { en: "Religion and Moral Education", bn: "ধর্ম শিক্ষা", fullMarks: 100 },
]

/** [Bengali name, English transliteration] — fictional, D-103 precedent. */
const NAMES: readonly [string, string][] = [
  ["রহিমা আক্তার", "Rahima Akter"],
  ["আব্দুল করিম", "Abdul Karim"],
  ["ফাতেমা বেগম", "Fatema Begum"],
  ["মোহাম্মদ ইমরান", "Mohammad Imran"],
  ["সাদিয়া ইসলাম", "Sadia Islam"],
  ["তানভীর আহমেদ", "Tanvir Ahmed"],
  ["নুসরাত জাহান", "Nusrat Jahan"],
  ["রাকিবুল হাসান", "Rakibul Hasan"],
  ["সুমাইয়া খাতুন", "Sumaiya Khatun"],
  ["আরিফুল ইসলাম", "Ariful Islam"],
  ["তাসনিয়া ফেরদৌস", "Tasnia Ferdous"],
  ["মাহমুদুল হাসান", "Mahmudul Hasan"],
  ["জান্নাতুল ফেরদৌসী", "Jannatul Ferdousi"],
  ["শাকিল আহমেদ", "Shakil Ahmed"],
  ["মিম আক্তার", "Mim Akter"],
  ["রায়হান কবির", "Rayhan Kabir"],
  ["লামিয়া সুলতানা", "Lamia Sultana"],
  ["ফারহান হোসেন", "Farhan Hossain"],
  ["ইসরাত জাহান", "Israt Jahan"],
  ["নাঈম হাসান", "Naeem Hasan"],
  ["তানজিলা আক্তার", "Tanzila Akter"],
  ["সাইফুল ইসলাম", "Saiful Islam"],
  ["মারিয়া আক্তার", "Maria Akter"],
  ["হাসিবুল হক", "Hasibul Haque"],
  ["সাবরিনা ইয়াসমিন", "Sabrina Yasmin"],
  ["ওয়াসিম আকরাম", "Wasim Akram"],
  ["রিয়া আক্তার", "Riya Akter"],
  ["জাহিদুল ইসলাম", "Jahidul Islam"],
  ["মেহজাবিন হক", "Mehjabin Haque"],
  ["তৌহিদুল ইসলাম", "Touhidul Islam"],
  ["নাফিসা তাবাসসুম", "Nafisa Tabassum"],
  ["রুবেল মিয়া", "Rubel Mia"],
  ["সাদিয়া আফরিন", "Sadia Afrin"],
  ["ইমরান হোসেন", "Imran Hossain"],
  ["তানজিনা আক্তার", "Tanzina Akter"],
  ["কামরুল হাসান", "Kamrul Hasan"],
  ["জেরিন সুলতানা", "Zerin Sultana"],
  ["আসিফ ইকবাল", "Asif Iqbal"],
  ["মৌসুমি আক্তার", "Mousumi Akter"],
  ["শাহরিয়ার কবির", "Shahriar Kabir"],
]

/** Deterministic PRNG (mulberry32) so the fixture is stable across renders
 * and test runs — no `Math.random()`, ever, in fixture data (PRODUCT-
 * DECISIONS anti-mock rule: the numbers must at least be reproducible). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Roll numbers whose fixture deliberately exercises an edge case the
 * template/acceptance criteria need to prove (spec §9 AC8, AC7, AC9). */
const INCOMPLETE_ROLL = 15 // missing one subject's mark
const INCOMPLETE_SUBJECT_INDEX = 3 // "Science" / "বিজ্ঞান"
const FAIL_ROLL = 22 // fails one subject -> GPA 0.00 (BD rule, §5.1)
const FAIL_SUBJECT_INDEX = 2 // "Mathematics" / "গণিত"
const LOW_ATTENDANCE_ROLL = 30 // below the 75% minimum -> warning line

function marksFor(roll: number, subjectIndex: number): number {
  const rng = mulberry32(roll * 97 + subjectIndex * 13 + 1)
  if (roll === FAIL_ROLL && subjectIndex === FAIL_SUBJECT_INDEX) return 28
  // 55-98, skewed toward the middle of the band table.
  return Math.round(55 + rng() * 43)
}

function buildSubjectRow(
  roll: number,
  subjectIndex: number
): ReportCardSubjectRow {
  const subject = SUBJECTS[subjectIndex]!
  if (roll === INCOMPLETE_ROLL && subjectIndex === INCOMPLETE_SUBJECT_INDEX) {
    return {
      subjectNameEn: subject.en,
      subjectNameBn: subject.bn,
      subjectKind: "compulsory",
      status: "entered", // entered, but no mark yet: prints "—"
      marksObtained: null,
      fullMarks: subject.fullMarks,
      letter: null,
      gradePoint: null,
    }
  }
  const marksObtained = marksFor(roll, subjectIndex)
  const pct = roundHalfUp((marksObtained / subject.fullMarks) * 100, 2)
  const band = bandFor(BD_GRADE_BANDS, pct)
  return {
    subjectNameEn: subject.en,
    subjectNameBn: subject.bn,
    subjectKind: "compulsory",
    status: "entered",
    marksObtained,
    fullMarks: subject.fullMarks,
    letter: band?.letter ?? null,
    gradePoint: band?.gradePoint ?? null,
  }
}

/** One student's full `ReportCardDto` (academic data only — no branding). */
function buildStudent(roll: number): ReportCardDto {
  const [nameBn, nameEn] = NAMES[roll - 1]!
  const subjects = SUBJECTS.map((_, i) => buildSubjectRow(roll, i))

  const anyFail = subjects.some((row) => row.letter === "F")
  const markedSubjects = subjects.filter((row) => row.marksObtained !== null)
  const totalObtained = markedSubjects.reduce(
    (sum, row) => sum + (row.marksObtained ?? 0),
    0
  )
  const totalFull = subjects.reduce((sum, row) => sum + row.fullMarks, 0)
  const percentage = roundHalfUp((totalObtained / totalFull) * 100, 0)
  // §5.1 BD rule: an F in any subject zeroes the GPA. Otherwise the mean of
  // the marked subjects' grade points — an incomplete subject (no mark yet)
  // is excluded from the mean rather than treated as 0, same distinction
  // §5.7(8) draws between "absent" (marked 0) and "not yet marked".
  const gradePoints = markedSubjects
    .map((row) => row.gradePoint)
    .filter((gp): gp is number => gp !== null)
  const gpa = anyFail
    ? 0
    : gradePoints.length > 0
      ? roundHalfUp(
          gradePoints.reduce((sum, gp) => sum + gp, 0) / gradePoints.length,
          2
        )
      : 0
  const overallBand = anyFail ? null : bandFor(BD_GRADE_BANDS, percentage)
  const overallLetter = anyFail ? "F" : (overallBand?.letter ?? "—")
  // F-AC-06 §5.10: a missing mark makes the result incomplete — no GPA,
  // grade or rank, rather than a silent zero.
  const incomplete = markedSubjects.length < subjects.length
  const result: ReportCardDto["result"] = incomplete
    ? "incomplete"
    : anyFail
      ? "fail"
      : "pass"

  const rng = mulberry32(roll * 31 + 7)
  const presentDays =
    roll === LOW_ATTENDANCE_ROLL
      ? 15
      : Math.min(
          ATTENDANCE_TOTAL_DAYS,
          Math.round(ATTENDANCE_TOTAL_DAYS * (0.85 + rng() * 0.15))
        )
  const attendancePercent = roundHalfUp(
    (presentDays / ATTENDANCE_TOTAL_DAYS) * 100,
    0
  )

  return {
    studentNameEn: nameEn,
    studentNameBn: nameBn,
    studentCode: `STU-2026-${String(roll).padStart(5, "0")}`,
    rollNumber: roll,
    className: CLASS_NAME_EN,
    sectionName: SECTION_NAME,
    examNameEn: EXAM_NAME_EN,
    examNameBn: EXAM_NAME_BN,
    subjects,
    totalObtained,
    totalFull,
    percentage,
    gpa: incomplete ? null : gpa,
    gpaWithoutOptional: null, // no 4th subject in Class 6
    overallLetter: incomplete ? null : overallLetter,
    result,
    rank: null, // filled in by rankClass6Ka() below, once every GPA is known
    rankTied: false,
    rankOf: FIXTURE_STUDENT_IDS.length,
    attendance: {
      presentDays,
      totalDays: ATTENDANCE_TOTAL_DAYS,
      percent: attendancePercent,
      belowMinimum: attendancePercent < ATTENDANCE_MIN_PERCENT,
    },
  }
}

/** Ranks by GPA desc, total obtained desc (§5.1) with standard competition
 * ranking (1, 2, 2, 4); incomplete/withheld students get no rank (F-AC-06
 * §5.10). Computed once over the whole class. */
function rankClass6Ka(students: ReportCardDto[]): ReportCardDto[] {
  const ranked = students
    .filter((s) => s.gpa !== null)
    .sort((a, b) => b.gpa! - a.gpa! || b.totalObtained - a.totalObtained)
  const sameKey = (a: ReportCardDto, b: ReportCardDto) =>
    a.gpa === b.gpa && a.totalObtained === b.totalObtained
  const rankByRoll = new Map<number, { rank: number; tied: boolean }>()
  ranked.forEach((student) => {
    const first = ranked.findIndex((other) => sameKey(other, student))
    const tied = ranked.filter((other) => sameKey(other, student)).length > 1
    rankByRoll.set(student.rollNumber, { rank: first + 1, tied })
  })
  return students.map((student) => {
    const r = rankByRoll.get(student.rollNumber)
    return { ...student, rank: r?.rank ?? null, rankTied: r?.tied ?? false }
  })
}

let cached: readonly ReportCardDto[] | null = null

/** All 40 students, Class 6-ক, ranked. Memoised — the fixture is pure and
 * identical on every call within a process. */
export function buildClass6KaReportCards(): readonly ReportCardDto[] {
  if (!cached) {
    const students = FIXTURE_STUDENT_IDS.map((_, i) => buildStudent(i + 1))
    cached = rankClass6Ka(students)
  }
  return cached
}
