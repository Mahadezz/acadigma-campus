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
      marksObtained: 88,
      fullMarks: 100,
      letter: "A+",
      gradePoint: 5,
    },
    {
      subjectNameEn: "Mathematics",
      subjectNameBn: "গণিত",
      marksObtained: null,
      fullMarks: 100,
      letter: null,
      gradePoint: null,
    },
  ],
  totalObtained: 88,
  totalFull: 200,
  percentage: 44,
  gpa: 5,
  overallLetter: "A+",
  result: "pass",
  rank: 1,
  rankOf: 40,
  attendance: {
    presentDays: 15,
    totalDays: 22,
    percent: 68,
    belowMinimum: true,
  },
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
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "bn", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).toContain("৭") // roll number
    expect(text).toContain("৬৮") // attendance percent
  })

  it("prints an em dash, never a false zero, for a subject with no mark yet (§5.7(8))", async () => {
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "bn", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).toContain("—")
  })

  it("names the incomplete subject in the banner (§4 W1)", async () => {
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "en", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).toContain("Mathematics")
    expect(text).toContain("not yet marked")
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

describe("ReportCardDocument — English render", () => {
  it("falls back to the Latin name/subject fields and Western digits", async () => {
    const buffer = await renderPdfToBuffer(
      ReportCardDocument({ locale: "en", ...BASE })
    )
    const text = (await pdfParse(buffer)).text
    expect(text).toContain("Rahima Akter")
    expect(text).toContain("Bangla")
    expect(text).toContain("Mathematics")
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
