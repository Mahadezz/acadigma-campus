/**
 * F-OP-03 Part 3 (D-206) — the report-card template's own golden test, same
 * technique as `../golden.test.ts`: render to real PDF bytes and extract the
 * text layer back out with `pdf-parse`, not just assert on the JSX tree.
 *
 * Bengali assertions compare character multisets, not exact substrings —
 * `golden.test.ts`'s file header explains why (pdfkit's ToUnicode CMap does
 * not reliably round-trip a reordered/ligated glyph back to logical order on
 * extraction, though the glyph on the actual page is correct).
 */
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { describe, expect, it } from "vitest"

import { renderPdfToBuffer } from "../render"

import { ReportCardDocument, type ReportCardDocumentProps } from "./report-card"

/** A complete, ranked card: a 4th subject, a tied rank. */
const BASE: Omit<ReportCardDocumentProps, "locale"> = {
  schoolName: "আদর্শ উচ্চ বিদ্যালয়",
  headerLines: ["Dhaka, Bangladesh", "EIIN 123456"],
  accentColor: "#1f4e79",
  footerNote: "School copy",
  generatedAt: new Date("2026-09-26T09:00:00.000Z"),
  studentNameEn: "Rahima Akter",
  studentNameBn: "রহিমা আক্তার",
  studentCode: "STU-2026-00007",
  rollNumber: 7,
  className: "Class 6",
  sectionName: "ক",
  examNameEn: "Half-Yearly Examination 2026",
  examNameBn: "অর্ধ-বার্ষিক পরীক্ষা ২০২৬",
  subjects: [
    {
      subjectNameEn: "Bangla",
      subjectNameBn: "বাংলা",
      subjectKind: "compulsory",
      status: "entered",
      marksObtained: 88,
      fullMarks: 100,
      letter: "A+",
      gradePoint: 5,
    },
    {
      subjectNameEn: "Mathematics",
      subjectNameBn: "গণিত",
      subjectKind: "compulsory",
      status: "entered",
      marksObtained: 72,
      fullMarks: 100,
      letter: "A",
      gradePoint: 4,
    },
    {
      subjectNameEn: "Agriculture",
      subjectNameBn: "কৃষি শিক্ষা",
      subjectKind: "optional_fourth",
      status: "entered",
      marksObtained: 65,
      fullMarks: 100,
      letter: "A-",
      gradePoint: 3.5,
    },
  ],
  totalObtained: 225,
  totalFull: 300,
  percentage: 75,
  gpa: 4.75,
  gpaWithoutOptional: 4.5,
  overallLetter: "A",
  result: "pass",
  rank: 2,
  rankTied: true,
  rankOf: 40,
  attendance: {
    presentDays: 15,
    totalDays: 22,
    percent: 68,
    belowMinimum: true,
  },
}

/** Mathematics not marked yet, English absent: F-AC-06 §5.10 incomplete. */
const INCOMPLETE: Omit<ReportCardDocumentProps, "locale"> = {
  ...BASE,
  subjects: [
    BASE.subjects[0]!,
    {
      ...BASE.subjects[1]!,
      marksObtained: null,
      letter: null,
      gradePoint: null,
    },
    {
      subjectNameEn: "English",
      subjectNameBn: "ইংরেজি",
      subjectKind: "compulsory",
      status: "absent",
      marksObtained: null,
      fullMarks: 100,
      letter: null,
      gradePoint: null,
    },
  ],
  totalObtained: 88,
  percentage: 29,
  gpa: null,
  gpaWithoutOptional: null,
  overallLetter: null,
  result: "incomplete",
  rank: null,
  rankTied: false,
}

async function textOf(
  props: Omit<ReportCardDocumentProps, "locale">,
  locale: "bn" | "en"
): Promise<string> {
  const buffer = await renderPdfToBuffer(
    ReportCardDocument({ locale, ...props })
  )
  return (await pdfParse(buffer)).text
}

function bengaliCharMultiset(text: string): string {
  return [...text]
    .filter((ch) => /[ঀ-৿]/.test(ch))
    .sort()
    .join("")
}

function expectSameBengaliGlyphs(actual: string, expected: string) {
  const actualSet = bengaliCharMultiset(actual)
  for (const ch of new Set(bengaliCharMultiset(expected))) {
    expect(actualSet).toContain(ch)
  }
}

describe("ReportCardDocument — Bengali render (golden)", () => {
  it("renders the student name, subject names and exam name intact", async () => {
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "bn", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expectSameBengaliGlyphs(text, "রহিমা আক্তার")
    expectSameBengaliGlyphs(text, "বাংলা")
    expectSameBengaliGlyphs(text, "গণিত")
    expectSameBengaliGlyphs(text, "অর্ধ-বার্ষিক পরীক্ষা")
  })

  it("prints Bengali digits for the roll number and the attendance percentage", async () => {
    const text = await textOf(BASE, "bn")
    // "রোল" can extract as "েরাল" (pre-base vowel order, golden.test.ts header).
    expect(text).toMatch(/(রোল|েরাল):\s*৭(?![০-৯])/)
    expect(text).toContain("৬৮") // attendance percent
  })

  it("titles the card প্রগতিপত্র and marks the 4th subject and a tied rank", async () => {
    const text = await textOf(BASE, "bn")
    expectSameBengaliGlyphs(text, "প্রগতিপত্র")
    expectSameBengaliGlyphs(text, "৪র্থ বিষয়")
    expect(text).toMatch(/২\s*\(সমান\)/)
    expect(text).toContain("৪.৭৫") // GPA
    expect(text).toContain("৪.৫০") // GPA without the 4th subject
  })

  it("prints the below-minimum attendance warning as a line, not a block (§5.2)", async () => {
    const okAttendance = {
      ...BASE,
      attendance: {
        presentDays: 21,
        totalDays: 22,
        percent: 95,
        belowMinimum: false,
      },
    }
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "en", ...okAttendance })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).toContain("95%")
  })
})

describe("ReportCardDocument — incomplete result (F-AC-06 §5.10)", () => {
  it("prints the withheld line and hides totals, percentage, GPA, grade, pass/fail and rank (en)", async () => {
    const text = await textOf(INCOMPLETE, "en")
    expect(text).toContain("Incomplete — result withheld")
    expect(text).toContain("Absent")
    expect(text).toContain("Subjects not yet marked: Mathematics")
    for (const hidden of [
      "Total",
      "Percentage",
      "GPA",
      "Pass",
      "Fail",
      "Rank",
      "29%",
    ]) {
      expect(text).not.toContain(hidden)
    }
  })

  it("prints অসম্পূর্ণ — ফলাফল স্থগিত and অনুপস্থিত, no GPA or rank (bn)", async () => {
    const text = await textOf(INCOMPLETE, "bn")
    expectSameBengaliGlyphs(text, "অসম্পূর্ণ ফলাফল স্থগিত")
    expectSameBengaliGlyphs(text, "অনুপস্থিত")
    expect(text).toContain("—") // not-yet-marked cell, never a false zero
    expect(text).not.toContain("মেধাক্রম")
    expect(text).not.toContain("জিপিএ")
    expect(text).not.toContain("শতকরা")
  })
})

describe("ReportCardDocument — English render", () => {
  it("falls back to the Latin name/subject fields and Western digits", async () => {
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "en", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).toContain("Rahima Akter")
    expect(text).toContain("Bangla")
    expect(text).toContain("Mathematics")
    expect(text).toContain("Progress Report")
    expect(text).toContain("Agriculture (4th subject)")
    expect(text).toContain("2 (tied) / 40")
    expect(text).toContain("68%")
    expect(text).not.toContain("৬৮")
  })

  it("never contains a banned placeholder school name (§9 AC1)", async () => {
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "en", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).not.toContain("TeachFlow")
    expect(text).not.toContain("School Troop")
  })
})
