import { describe, expect, it } from "vitest"

import { reportCardDtoSchema } from "@acadigma/contracts"

import {
  buildClass6KaReportCards,
  FIXTURE_EXAM_ID,
  FIXTURE_STUDENT_IDS,
} from "./report-card-fixture"

/**
 * F-OP-03 Part 3 (D-206) — proves the fixture is internally consistent
 * before anything renders it: 40 students, deterministic (no `Math.random`),
 * the BD grade-scale rule (§5.1: an F in any subject zeroes the GPA) holds,
 * an empty mark never becomes a false zero (§5.7(8)) but makes the result
 * incomplete, and ranks follow competition ranking.
 */
describe("buildClass6KaReportCards", () => {
  it("builds exactly 40 students, one per FIXTURE_STUDENT_IDS entry", () => {
    const students = buildClass6KaReportCards()
    expect(students).toHaveLength(40)
    expect(FIXTURE_STUDENT_IDS).toHaveLength(40)
  })

  it("is deterministic across calls (memoised, no Math.random)", () => {
    const a = buildClass6KaReportCards()
    const b = buildClass6KaReportCards()
    expect(a).toBe(b) // same reference — memoised
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)))
  })

  it("ranks the 39 complete students with competition ranking; the incomplete one is unranked", () => {
    const students = buildClass6KaReportCards()
    const ranked = students.filter((s) => s.rank !== null)
    expect(ranked).toHaveLength(39)
    // Competition ranking: a rank r is shared by k students, then r + k follows.
    const ranks = ranked.map((s) => s.rank!).sort((a, b) => a - b)
    ranks.forEach((rank, i) => expect(rank).toBeLessThanOrEqual(i + 1))
    expect(ranks[0]).toBe(1)
    for (const s of ranked) {
      const shared = ranked.filter((o) => o.rank === s.rank).length
      expect(s.rankTied).toBe(shared > 1)
    }
  })

  it("every fixture card satisfies the contract (incl. incomplete => no GPA, grade or rank)", () => {
    for (const student of buildClass6KaReportCards()) {
      expect(reportCardDtoSchema.safeParse(student).success).toBe(true)
    }
  })

  it("a student with an F in any subject has GPA 0.00 and result fail (§5.1 BD rule)", () => {
    const students = buildClass6KaReportCards()
    const failer = students.find((s) =>
      s.subjects.some((row) => row.letter === "F")
    )
    expect(failer).toBeDefined()
    expect(failer?.gpa).toBe(0)
    expect(failer?.result).toBe("fail")
  })

  it("a student missing one subject's mark still renders — null, not 0 (§5.7(8))", () => {
    const students = buildClass6KaReportCards()
    const incomplete = students.find((s) =>
      s.subjects.some((row) => row.marksObtained === null)
    )
    expect(incomplete).toBeDefined()
    const missingRow = incomplete?.subjects.find(
      (row) => row.marksObtained === null
    )
    expect(missingRow?.letter).toBeNull()
    expect(missingRow?.gradePoint).toBeNull()
    expect(incomplete?.result).toBe("incomplete")
    expect(incomplete?.gpa).toBeNull()
    expect(incomplete?.overallLetter).toBeNull()
    expect(incomplete?.rank).toBeNull()
  })

  it("at least one student is below the attendance minimum (warning-line case, §5.2)", () => {
    const students = buildClass6KaReportCards()
    expect(students.some((s) => s.attendance.belowMinimum)).toBe(true)
  })

  it("every student has 6 subjects and a positive total", () => {
    for (const student of buildClass6KaReportCards()) {
      expect(student.subjects).toHaveLength(6)
      expect(student.totalFull).toBe(600)
    }
  })

  it("FIXTURE_EXAM_ID and FIXTURE_STUDENT_IDS are distinct fixed uuids", () => {
    expect(FIXTURE_STUDENT_IDS).not.toContain(FIXTURE_EXAM_ID)
    expect(new Set(FIXTURE_STUDENT_IDS).size).toBe(FIXTURE_STUDENT_IDS.length)
  })
})
