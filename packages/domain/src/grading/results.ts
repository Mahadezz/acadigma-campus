/**
 * Exam results — F-AC-06 §5.1-5.6 and §5.8, exam scope (Part 5, D-305).
 * The TypeScript reference for `app.compute_results`: both are held to the
 * golden fixture in `supabase/tests/55_results.sql` (`results.test.ts`), so
 * the SQL a report card prints from and this code cannot drift.
 */
import { roundHalfUp } from "./round"
import { bandFor, type GradeBand } from "./scale"

export type MarkStatus = "entered" | "absent" | "exempt"

export type PaperMark = {
  fullMarks: number
  passMarks: number
  /** Null: no mark entered yet — the student is `incomplete` (§5.10). */
  status: MarkStatus | null
  /** Present exactly when `status` is `entered`. */
  obtained: number | null
}

export type StudentMarks = {
  studentId: string
  sectionId: string
  papers: PaperMark[]
}

export type PaperLine = {
  /** 0 when absent, null when exempt or not entered. */
  percentage: number | null
  letter: string | null
  gradePoint: number | null
  /** Null when exempt or not entered. */
  passed: boolean | null
}

export type StudentResult = {
  studentId: string
  sectionId: string
  totalObtained: number
  totalFull: number
  /** Over the papers that count so far; null when none does. */
  percentage: number | null
  /** Null when incomplete (or every paper exempt). */
  gpa: number | null
  letter: string | null
  status: "pass" | "fail" | "incomplete"
  failedSubjects: number
  sectionRank: number | null
  lines: PaperLine[]
}

/** §5.1 + §5.2 + the pass rule: one paper. */
export function paperLine(
  bands: readonly GradeBand[],
  mark: PaperMark
): PaperLine {
  if (mark.status === "exempt" || mark.status === null) {
    return { percentage: null, letter: null, gradePoint: null, passed: null }
  }
  const obtained = mark.obtained ?? 0
  const percentage =
    mark.status === "absent"
      ? 0
      : roundHalfUp((100 * obtained) / mark.fullMarks, 2)
  const band = bandFor(bands, percentage)
  return {
    percentage,
    letter: band?.letter ?? null,
    gradePoint: band?.gradePoint ?? null,
    passed:
      mark.status === "entered" &&
      obtained >= mark.passMarks &&
      band !== null &&
      !band.isFail,
  }
}

/** The first band, top down, whose grade point is at or below the GPA. */
export function gpaLetter(
  bands: readonly GradeBand[],
  gpa: number | null
): string | null {
  if (gpa === null) return null
  const sorted = [...bands].sort((a, b) => a.sortOrder - b.sortOrder)
  return sorted.find((b) => b.gradePoint <= gpa)?.letter ?? null
}

/** Sum of 2-decimal values, exactly (in hundredths). */
function sum2(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100
}

/**
 * Every student's result, ranked within their section by GPA, then total,
 * then percentage (§5.8, `rank()` — competition ranking, ties share a rank).
 */
export function computeResults(
  bands: readonly GradeBand[],
  failZeroesGpa: boolean,
  students: readonly StudentMarks[]
): StudentResult[] {
  const results = students.map((student): StudentResult => {
    const lines = student.papers.map((p) => paperLine(bands, p))
    const incomplete = student.papers.some((p) => p.status === null)
    const counted = student.papers
      .map((paper, i) => ({ paper, line: lines[i]! }))
      .filter((x) => x.paper.status !== "exempt" && x.paper.status !== null)
    const totalObtained = sum2(counted.map((x) => x.paper.obtained ?? 0))
    const totalFull = sum2(counted.map((x) => x.paper.fullMarks))
    const failedSubjects = counted.filter((x) => x.line.passed === false).length
    const gradePoints = counted.map((x) => x.line.gradePoint ?? 0)
    const gpa =
      incomplete || gradePoints.length === 0
        ? null
        : failZeroesGpa && failedSubjects > 0
          ? 0
          : roundHalfUp(sum2(gradePoints) / gradePoints.length, 2)
    return {
      studentId: student.studentId,
      sectionId: student.sectionId,
      totalObtained,
      totalFull,
      percentage:
        totalFull > 0
          ? roundHalfUp((100 * totalObtained) / totalFull, 2)
          : null,
      gpa,
      letter: gpaLetter(bands, gpa),
      status: incomplete ? "incomplete" : failedSubjects > 0 ? "fail" : "pass",
      failedSubjects,
      sectionRank: null,
      lines,
    }
  })

  const better = (a: StudentResult, b: StudentResult) =>
    a.gpa! > b.gpa! ||
    (a.gpa === b.gpa &&
      (a.totalObtained > b.totalObtained ||
        (a.totalObtained === b.totalObtained && a.percentage! > b.percentage!)))
  for (const r of results) {
    if (r.gpa === null) continue
    const rivals = results.filter(
      (o) => o.sectionId === r.sectionId && o.gpa !== null
    )
    r.sectionRank = 1 + rivals.filter((o) => better(o, r)).length
  }
  return results
}
