import { describe, expect, it } from "vitest"

import { parityRows } from "./parity"
import { computeResults, gpaLetter, paperLine, type PaperMark } from "./results"
import { BD_GRADE_BANDS } from "./scale"

const GOLDEN = "55_results.sql"

/** P1-P5 out of 100 (pass 33), P6 out of 50 (pass 16.50) — as in the pgTAP fixture. */
function mark(cell: string, paper: number): PaperMark {
  const fullMarks = paper === 5 ? 50 : 100
  const passMarks = paper === 5 ? 16.5 : 33
  if (cell === "A")
    return { fullMarks, passMarks, status: "absent", obtained: null }
  if (cell === "E")
    return { fullMarks, passMarks, status: "exempt", obtained: null }
  return { fullMarks, passMarks, status: "entered", obtained: Number(cell) }
}

describe("computeResults — the golden fixture (parity with app.compute_results)", () => {
  const students = parityRows("golden_marks", GOLDEN).map(
    ([code, ...cells]) => ({
      studentId: code!,
      sectionId: "6A",
      papers: cells.map(mark),
    })
  )
  const results = new Map(
    computeResults(BD_GRADE_BANDS, true, students).map((r) => [r.studentId, r])
  )

  it("has ten students and ten expected rows", () => {
    expect(students).toHaveLength(10)
    expect(parityRows("golden_expected", GOLDEN)).toHaveLength(10)
  })

  it.each(parityRows("golden_expected", GOLDEN))(
    "%s: total %s/%s, %s %%, GPA %s %s, %s, %s failed, rank %s",
    (code, total, full, pct, gpa, letter, status, failed, rank) => {
      const r = results.get(code!)!
      expect({
        total: r.totalObtained,
        full: r.totalFull,
        pct: r.percentage,
        gpa: r.gpa,
        letter: r.letter,
        status: r.status,
        failed: r.failedSubjects,
        rank: r.sectionRank,
      }).toEqual({
        total: Number(total),
        full: Number(full),
        pct: Number(pct),
        gpa: Number(gpa),
        letter,
        status,
        failed: Number(failed),
        rank: Number(rank),
      })
    }
  )
})

describe("paperLine", () => {
  it("bands without rounding and flips exactly at the pass mark", () => {
    expect(paperLine(BD_GRADE_BANDS, mark("79.5", 0))).toMatchObject({
      letter: "A",
      passed: true,
    })
    expect(paperLine(BD_GRADE_BANDS, mark("32.5", 0))).toMatchObject({
      letter: "F",
      passed: false,
    })
    expect(paperLine(BD_GRADE_BANDS, mark("16.5", 5))).toMatchObject({
      percentage: 33,
      letter: "D",
      passed: true,
    })
    expect(paperLine(BD_GRADE_BANDS, mark("16.49", 5))).toMatchObject({
      percentage: 32.98,
      letter: "F",
      passed: false,
    })
  })

  it("absent is 0 % and failed; exempt has nothing", () => {
    expect(paperLine(BD_GRADE_BANDS, mark("A", 0))).toEqual({
      percentage: 0,
      letter: "F",
      gradePoint: 0,
      passed: false,
    })
    expect(paperLine(BD_GRADE_BANDS, mark("E", 0))).toEqual({
      percentage: null,
      letter: null,
      gradePoint: null,
      passed: null,
    })
  })
})

describe("computeResults — rules", () => {
  const entered = (...values: number[]) => values.map((v) => mark(String(v), 0))

  it("AC-2: grade points 5, 4, 3.5, 4, 5 give GPA 4.30", () => {
    const [r] = computeResults(BD_GRADE_BANDS, true, [
      { studentId: "x", sectionId: "s", papers: entered(85, 75, 65, 75, 85) },
    ])
    expect(r!.gpa).toBe(4.3)
  })

  it("AC-3: an F zeroes the GPA, unless the school turns the rule off", () => {
    const papers = entered(85, 75, 65, 75, 20)
    expect(
      computeResults(BD_GRADE_BANDS, true, [
        { studentId: "x", sectionId: "s", papers },
      ])[0]
    ).toMatchObject({ gpa: 0, status: "fail", failedSubjects: 1, letter: "F" })
    expect(
      computeResults(BD_GRADE_BANDS, false, [
        { studentId: "x", sectionId: "s", papers },
      ])[0]
    ).toMatchObject({ gpa: 3.3, status: "fail" })
  })

  it("AC-7: GPAs 5.00, 4.50, 4.50, 4.00 rank 1, 2, 2, 4, per section", () => {
    const rs = computeResults(BD_GRADE_BANDS, true, [
      { studentId: "a", sectionId: "s", papers: entered(90, 90) },
      { studentId: "b", sectionId: "s", papers: entered(90, 75) },
      { studentId: "c", sectionId: "s", papers: entered(75, 90) },
      { studentId: "d", sectionId: "s", papers: entered(75, 75) },
      { studentId: "e", sectionId: "t", papers: entered(40, 40) },
    ])
    expect(rs.map((r) => r.sectionRank)).toEqual([1, 2, 2, 4, 1])
  })

  it("a student with every paper exempt has no GPA and no rank", () => {
    const [r] = computeResults(BD_GRADE_BANDS, true, [
      { studentId: "x", sectionId: "s", papers: [mark("E", 0)] },
    ])
    expect(r).toMatchObject({
      gpa: null,
      percentage: null,
      sectionRank: null,
      letter: null,
    })
  })

  it("GPA is never above 5.00 or below 0 (property check)", () => {
    let seed = 7
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    const students = Array.from({ length: 300 }, (_, i) => ({
      studentId: String(i),
      sectionId: "s",
      papers: Array.from({ length: 6 }, () =>
        mark(String(Math.floor(rand() * 10001) / 100), 0)
      ),
    }))
    for (const r of computeResults(BD_GRADE_BANDS, true, students)) {
      expect(r.gpa).toBeGreaterThanOrEqual(0)
      expect(r.gpa).toBeLessThanOrEqual(5)
    }
  })

  it("gpaLetter reads the band table top down", () => {
    expect(gpaLetter(BD_GRADE_BANDS, 4.67)).toBe("A")
    expect(gpaLetter(BD_GRADE_BANDS, 3.4)).toBe("B")
    expect(gpaLetter(BD_GRADE_BANDS, 0)).toBe("F")
    expect(gpaLetter(BD_GRADE_BANDS, null)).toBeNull()
  })
})
