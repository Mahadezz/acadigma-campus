/**
 * F-AC-02 §4.7 bulk import, demo cut (D-106) — turns a parsed sheet
 * (header row + data rows, every cell a string) into the per-row report
 * the preview shows and `public.import_student_batch` admits. Pure; the
 * database re-checks every rule through `public.admit_student`.
 */

import {
  quickAdmitInputSchema,
  STUDENT_IMPORT_COLUMNS,
  STUDENT_IMPORT_MAX_ROWS,
  OPTIONAL_IMPORT_COLUMNS,
  type GuardianRelation,
  type ImportFileErrorCode,
  type ImportReport,
  type ImportReportRow,
  type ImportRowError,
  type StudentGender,
  type StudentImportColumn,
} from "@acadigma/contracts"

export type ImportSectionOption = {
  id: string
  gradeName: string
  gradeNameBn: string
  levelNumber: number
  sectionName: string
}

/** A student already actively enrolled this year, keyed like a row. */
export type ImportExistingStudent = {
  sectionId: string
  /** `lower(first_name || ' ' || last_name)` */
  name: string
  dateOfBirth: string
  studentCode: string
}

/** How a row is recognised as the same student: section, name, birthday. */
export function studentKey(
  sectionId: string,
  name: string,
  dateOfBirth: string
): string {
  return `${sectionId}|${name.normalize("NFC").trim().toLowerCase()}|${dateOfBirth}`
}

export type StudentImportValidation =
  | {
      ok: false
      fileError: ImportFileErrorCode
      missingColumns?: StudentImportColumn[]
    }
  | {
      ok: true
      report: ImportReport
      totals: { total: number; valid: number; error: number }
    }

/** Case, spaces and punctuation do not matter; Bangla vowel signs do. */
function norm(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
}

const BANGLA_DIGITS = /[০-৯]/g
function westernDigits(value: string): string {
  return value.replace(BANGLA_DIGITS, (d) => String(d.charCodeAt(0) - 0x09e6))
}

function lookup<T extends string>(table: Record<T, string[]>): Map<string, T> {
  const map = new Map<string, T>()
  for (const [value, words] of Object.entries(table) as [T, string[]][]) {
    for (const word of [value, ...words]) map.set(norm(word), value)
  }
  return map
}

const GENDERS = lookup<StudentGender>({
  male: ["m", "boy", "ছেলে", "ছাত্র", "পুরুষ"],
  female: ["f", "girl", "মেয়ে", "ছাত্রী", "মহিলা", "নারী"],
  other: ["অন্যান্য"],
})

const RELATIONS = lookup<GuardianRelation>({
  father: ["বাবা", "পিতা", "আব্বা"],
  mother: ["মা", "মাতা", "আম্মা"],
  brother: ["ভাই"],
  sister: ["বোন"],
  uncle: ["চাচা", "মামা", "কাকা", "খালু", "ফুফা"],
  aunt: ["চাচী", "চাচি", "মামী", "মামি", "খালা", "ফুফু", "কাকী", "কাকি"],
  grandparent: [
    "grandfather",
    "grandmother",
    "দাদা",
    "দাদি",
    "দাদী",
    "নানা",
    "নানি",
    "নানী",
  ],
  legal_guardian: ["guardian", "অভিভাবক"],
  other: ["অন্যান্য"],
})

const NUMBER_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
]
const ROMAN = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
]
const SHRENI = /(শ্রেণি|শ্রেণী)$/u

/** "6", "Class 6", "6th", "Six", "Class Six", "VI", "৬" → 6; else null. */
export function classLevel(value: string): number | null {
  const v = norm(westernDigits(value))
    .replace(/^(class|grade)/, "")
    .replace(SHRENI, "")
  const n = /^(\d{1,2})(st|nd|rd|th)?$/.exec(v)
  if (n) return Number(n[1])
  const word = NUMBER_WORDS.indexOf(v)
  if (word >= 0) return word + 1
  const roman = ROMAN.indexOf(v)
  return roman >= 0 ? roman + 1 : null
}

/** `YYYY-MM-DD`, or `DD/MM/YYYY` (also `-` or `.`), the way Bangladesh
 * writes dates. Null when it is not a real calendar date. */
export function parseImportDate(value: string): string | null {
  const v = westernDigits(value.trim())
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v)
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v)
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : [NaN, NaN, NaN]
  const date = new Date(Date.UTC(y, m - 1, d))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null
  }
  return date.toISOString().slice(0, 10)
}

function headerIndex(header: string[]): {
  index: Map<StudentImportColumn, number>
  ignored: string[]
} {
  const aliases = new Map<string, StudentImportColumn>()
  for (const c of STUDENT_IMPORT_COLUMNS) {
    for (const a of [c.key, c.en, c.bn, `${c.en} / ${c.bn}`]) {
      aliases.set(norm(a), c.key)
    }
  }
  const index = new Map<StudentImportColumn, number>()
  const ignored: string[] = []
  header.forEach((cell, i) => {
    const key = aliases.get(norm(cell))
    if (key && !index.has(key)) index.set(key, i)
    else if (cell.trim()) ignored.push(cell.trim())
  })
  return { index, ignored }
}

/** A mobile typed into a number cell loses its leading 0 (1712345678). */
function phoneCell(value: string): string {
  const v = westernDigits(value)
  return /^1[3-9]\d{8}$/.test(v) ? `0${v}` : v
}

/** Zod paths of `quickAdmitInputSchema` → template columns. */
const PATH_COLUMN: Record<string, StudentImportColumn> = {
  firstName: "first_name",
  lastName: "last_name",
  fullNameBn: "full_name_bn",
  gender: "gender",
  dateOfBirth: "date_of_birth",
  sectionId: "section",
  rollNumber: "roll_number",
  "guardian.relation": "guardian_relation",
  "guardian.fullName": "guardian_name",
  "guardian.phone": "guardian_phone",
}

export function validateStudentImport(
  table: string[][],
  sections: ImportSectionOption[],
  today: string,
  existing: ImportExistingStudent[] = []
): StudentImportValidation {
  // The header is the first of the top 10 rows naming ≥ 3 template
  // columns (registers often start with a school name or a title).
  const headerAt = Math.max(
    0,
    table.slice(0, 10).findIndex((row) => headerIndex(row).index.size >= 3)
  )
  const header = table[headerAt]
  if (!header) return { ok: false, fileError: "empty" }
  const { index, ignored } = headerIndex(header)
  const missingColumns = STUDENT_IMPORT_COLUMNS.map((c) => c.key).filter(
    (key) => !index.has(key) && !OPTIONAL_IMPORT_COLUMNS.includes(key)
  )
  if (missingColumns.length) {
    return { ok: false, fileError: "missing_columns", missingColumns }
  }

  const lines = table
    .map((cells, i) => ({ cells, line: i + 1 }))
    .slice(headerAt + 1)
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""))
  if (lines.length === 0) return { ok: false, fileError: "empty" }
  if (lines.length > STUDENT_IMPORT_MAX_ROWS) {
    return { ok: false, fileError: "too_many_rows" }
  }

  const rollsSeen = new Set<string>()
  const onRoster = new Map(
    existing.map((e) => [
      studentKey(e.sectionId, e.name, e.dateOfBirth),
      e.studentCode,
    ])
  )
  const inFile = new Set<string>()
  const rows = lines.map(({ cells, line }): ImportReportRow => {
    const cell = (key: StudentImportColumn): string => {
      const i = index.get(key)
      return i === undefined ? "" : (cells[i] ?? "").normalize("NFC").trim()
    }
    const errors: ImportRowError[] = []
    const fail = (column: StudentImportColumn, code: ImportRowError["code"]) =>
      errors.push({ column, code })

    for (const key of [
      "first_name",
      "last_name",
      "date_of_birth",
      "gender",
      "class",
      "section",
      "guardian_relation",
      "guardian_name",
      "guardian_phone",
    ] as const) {
      if (!cell(key)) fail(key, "required")
    }

    const dob = cell("date_of_birth")
      ? parseImportDate(cell("date_of_birth"))
      : null
    if (cell("date_of_birth")) {
      if (!dob || dob < "1950-01-01") fail("date_of_birth", "invalid_date")
      else if (dob > today) fail("date_of_birth", "future_date")
    }

    const gender = GENDERS.get(norm(cell("gender")))
    if (cell("gender") && !gender) fail("gender", "invalid_gender")
    const relation = RELATIONS.get(norm(cell("guardian_relation")))
    if (cell("guardian_relation") && !relation) {
      fail("guardian_relation", "invalid_relation")
    }

    let sectionId: string | undefined
    if (cell("class") && cell("section")) {
      const klass = norm(westernDigits(cell("class")))
      const level = classLevel(cell("class"))
      const inClass = sections.filter(
        (s) =>
          norm(s.gradeName) === klass ||
          norm(s.gradeNameBn) === klass ||
          norm(s.gradeNameBn).replace(SHRENI, "") === klass ||
          s.levelNumber === level
      )
      const want = norm(cell("section"))
      sectionId = inClass.find((s) => norm(s.sectionName) === want)?.id
      if (inClass.length === 0) fail("class", "unknown_class")
      else if (!sectionId) fail("section", "unknown_section")
    }

    let rollNumber: number | null = null
    const rollCell = westernDigits(cell("roll_number"))
    if (rollCell) {
      rollNumber = /^\d{1,4}$/.test(rollCell) ? Number(rollCell) : 0
      if (rollNumber < 1) fail("roll_number", "invalid_roll")
      else if (sectionId) {
        const key = `${sectionId}:${rollNumber}`
        if (rollsSeen.has(key)) fail("roll_number", "duplicate_roll")
        rollsSeen.add(key)
      }
    }

    // The quick-admit schema is the last word, so an import can never
    // accept a row the admit sheet would refuse.
    if (errors.length === 0) {
      const parsed = quickAdmitInputSchema.safeParse({
        idempotencyKey: "00000000-0000-4000-8000-000000000000",
        firstName: cell("first_name"),
        lastName: cell("last_name"),
        fullNameBn: cell("full_name_bn"),
        gender,
        dateOfBirth: dob,
        sectionId,
        rollNumber,
        guardian: {
          relation,
          fullName: cell("guardian_name"),
          phone: phoneCell(cell("guardian_phone")),
        },
      })
      if (parsed.success) {
        const v = parsed.data
        const key = studentKey(
          v.sectionId,
          `${v.firstName} ${v.lastName}`,
          v.dateOfBirth
        )
        const code = onRoster.get(key)
        if (code) {
          return {
            line,
            status: "error",
            errors: [{ column: null, code: "already_admitted" }],
            student_code: code,
          }
        }
        if (inFile.has(key)) {
          return {
            line,
            status: "error",
            errors: [{ column: null, code: "duplicate_in_file" }],
          }
        }
        inFile.add(key)
        return {
          line,
          status: "valid",
          errors: [],
          input: {
            first_name: v.firstName,
            last_name: v.lastName,
            full_name_bn: v.fullNameBn ?? null,
            gender: v.gender,
            date_of_birth: v.dateOfBirth,
            section_id: v.sectionId,
            roll_number: v.rollNumber ?? null,
            guardian: {
              relation: v.guardian.relation,
              full_name: v.guardian.fullName,
              full_name_bn: null,
              phone: v.guardian.phone,
            },
          },
        }
      }
      for (const issue of parsed.error.issues) {
        const column = PATH_COLUMN[issue.path.join(".")] ?? null
        const code =
          column === "guardian_phone"
            ? "invalid_phone"
            : issue.code === "too_big"
              ? "too_long"
              : "required"
        if (column) fail(column, code)
      }
      if (errors.length === 0) errors.push({ column: null, code: "VALIDATION" })
    }

    const raw: Record<string, string> = {}
    for (const key of index.keys()) raw[key] = cell(key)
    return { line, status: "error", errors, raw }
  })

  const valid = rows.filter((r) => r.status === "valid").length
  return {
    ok: true,
    report: { rows, ignoredColumns: ignored },
    totals: { total: rows.length, valid, error: rows.length - valid },
  }
}
