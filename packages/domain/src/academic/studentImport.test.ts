import { describe, expect, it } from "vitest"

import { STUDENT_IMPORT_COLUMNS } from "@acadigma/contracts"

import {
  parseImportDate,
  validateStudentImport,
  type ImportSectionOption,
} from "./studentImport"

const KA = "6a1d3b2f-9c8e-4d4b-8f70-2b3c4d5e6f7a"
const KHA = "7b2e4c3a-0d9f-4e5c-9a81-3c4d5e6f7a8b"
const SECTIONS: ImportSectionOption[] = [
  {
    id: KA,
    gradeName: "Class 6",
    gradeNameBn: "ষষ্ঠ শ্রেণি",
    levelNumber: 6,
    sectionName: "ক",
  },
  {
    id: KHA,
    gradeName: "Class 6",
    gradeNameBn: "ষষ্ঠ শ্রেণি",
    levelNumber: 6,
    sectionName: "খ",
  },
]
const TODAY = "2026-09-26"
const HEADER = STUDENT_IMPORT_COLUMNS.map((c) => `${c.en} / ${c.bn}`)

// first, last, bn, dob, gender, class, section, roll, relation, guardian, phone
const good = [
  "Rahim",
  "Uddin",
  "রহিম উদ্দিন",
  "2014-03-09",
  "male",
  "Class 6",
  "ক",
  "",
  "father",
  "Karim Uddin",
  "01712345678",
]

function row(patch: Record<number, string>): string[] {
  return good.map((cell, i) => patch[i] ?? cell)
}

function validate(rows: string[][], header = HEADER) {
  const result = validateStudentImport([header, ...rows], SECTIONS, TODAY)
  if (!result.ok) throw new Error(result.fileError)
  return result
}

describe("parseImportDate", () => {
  it("reads ISO and day-first dates, in either digit script", () => {
    expect(parseImportDate("2014-03-09")).toBe("2014-03-09")
    expect(parseImportDate("09/03/2014")).toBe("2014-03-09")
    expect(parseImportDate("9.3.2014")).toBe("2014-03-09")
    expect(parseImportDate("০৯/০৩/২০১৪")).toBe("2014-03-09")
  })
  it("refuses dates that are not on the calendar", () => {
    expect(parseImportDate("31/02/2014")).toBeNull()
    expect(parseImportDate("2014-13-01")).toBeNull()
    expect(parseImportDate("March 9")).toBeNull()
  })
})

describe("validateStudentImport", () => {
  it("turns a good row into the admit_student payload", () => {
    const { report, totals } = validate([good])
    expect(totals).toEqual({ total: 1, valid: 1, error: 0 })
    expect(report.rows[0]).toEqual({
      line: 2,
      status: "valid",
      errors: [],
      input: {
        first_name: "Rahim",
        last_name: "Uddin",
        full_name_bn: "রহিম উদ্দিন",
        gender: "male",
        date_of_birth: "2014-03-09",
        section_id: KA,
        roll_number: null,
        guardian: {
          relation: "father",
          full_name: "Karim Uddin",
          full_name_bn: null,
          phone: "+8801712345678",
        },
      },
    })
  })

  it("accepts Bangla words, Bangla digits, the class number and bare keys as headers", () => {
    const header = STUDENT_IMPORT_COLUMNS.map((c) => c.key)
    const { report } = validate(
      [row({ 4: "মেয়ে", 5: "৬", 6: "খ", 7: "৩", 8: "মা", 10: "০১৮১১১১১১১১" })],
      header
    )
    expect(report.rows[0]?.input).toMatchObject({
      gender: "female",
      section_id: KHA,
      roll_number: 3,
      guardian: { relation: "mother", phone: "+8801811111111" },
    })
  })

  it("reports each bad cell with its line and column, and keeps what was typed", () => {
    const { report, totals } = validate([
      good,
      row({ 3: "31/02/2014" }),
      row({ 6: "Z" }),
      row({ 5: "Class 9" }),
      row({ 10: "01212345678", 8: "friend" }),
      row({ 0: "", 3: "2030-01-01", 4: "robot" }),
    ])
    expect(totals).toEqual({ total: 6, valid: 1, error: 5 })
    expect(report.rows.map((r) => [r.line, r.errors])).toEqual([
      [2, []],
      [3, [{ column: "date_of_birth", code: "invalid_date" }]],
      [4, [{ column: "section", code: "unknown_section" }]],
      [5, [{ column: "class", code: "unknown_class" }]],
      [6, [{ column: "guardian_relation", code: "invalid_relation" }]],
      [
        7,
        [
          { column: "first_name", code: "required" },
          { column: "date_of_birth", code: "future_date" },
          { column: "gender", code: "invalid_gender" },
        ],
      ],
    ])
    expect(report.rows[1]?.raw?.date_of_birth).toBe("31/02/2014")
  })

  it("refuses a phone that is not a Bangladeshi mobile", () => {
    const { report } = validate([row({ 10: "01212345678" })])
    expect(report.rows[0]?.errors).toEqual([
      { column: "guardian_phone", code: "invalid_phone" },
    ])
  })

  it("flags a roll number used twice in the same section, and a zero roll", () => {
    const { report } = validate([
      row({ 7: "5" }),
      row({ 7: "5" }),
      row({ 7: "5", 6: "খ" }),
      row({ 7: "0" }),
    ])
    expect(report.rows.map((r) => r.errors[0]?.code ?? "ok")).toEqual([
      "ok",
      "duplicate_roll",
      "ok",
      "invalid_roll",
    ])
  })

  it("skips blank lines but keeps spreadsheet line numbers", () => {
    const { report } = validate([good, ["", " "], good])
    expect(report.rows.map((r) => r.line)).toEqual([2, 4])
  })

  it("names missing required columns and ignores unknown ones", () => {
    expect(
      validateStudentImport([["First name", "Last name"]], SECTIONS, TODAY)
    ).toMatchObject({
      ok: false,
      fileError: "missing_columns",
      missingColumns: expect.arrayContaining([
        "date_of_birth",
        "guardian_phone",
      ]),
    })
    const { report } = validate([[...good, "x"]], [...HEADER, "Religion"])
    expect(report.ignoredColumns).toEqual(["Religion"])
  })

  it("refuses an empty file and one over 2,000 rows", () => {
    expect(validateStudentImport([], SECTIONS, TODAY)).toMatchObject({
      fileError: "empty",
    })
    expect(validateStudentImport([HEADER], SECTIONS, TODAY)).toMatchObject({
      fileError: "empty",
    })
    const many = Array.from({ length: 2001 }, () => good)
    expect(
      validateStudentImport([HEADER, ...many], SECTIONS, TODAY)
    ).toMatchObject({ fileError: "too_many_rows" })
  })
})
