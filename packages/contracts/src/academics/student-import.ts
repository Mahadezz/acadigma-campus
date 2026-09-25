import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-AC-02 §4.7 bulk student import, demo cut (D-106). Enum mirrors
 * 20260925300312_student_import_batches.sql.
 */

export const importStatusSchema = z.enum([
  "validating",
  "preview",
  "importing",
  "completed",
  "failed",
])
export type ImportStatus = z.infer<typeof importStatusSchema>

/** D-106: the spec's 5 MB does not fit a server action body (1 MB), and
 * 2,000 rows is well above one school's register. */
export const STUDENT_IMPORT_MAX_ROWS = 2000
export const STUDENT_IMPORT_MAX_BYTES = 1_000_000

/** The template's columns, in order. Headers are "English / বাংলা"; a file
 * may use either half, the whole header, or the key. */
export const STUDENT_IMPORT_COLUMNS = [
  {
    key: "first_name",
    en: "First name (English)",
    bn: "নামের প্রথম অংশ (ইংরেজি)",
  },
  {
    key: "last_name",
    en: "Last name (English)",
    bn: "নামের শেষ অংশ (ইংরেজি)",
  },
  { key: "full_name_bn", en: "Full name in Bangla", bn: "বাংলায় পুরো নাম" },
  {
    key: "date_of_birth",
    en: "Date of birth (YYYY-MM-DD or DD/MM/YYYY)",
    bn: "জন্ম তারিখ",
  },
  { key: "gender", en: "Gender (male/female/other)", bn: "লিঙ্গ" },
  { key: "class", en: "Class", bn: "শ্রেণি" },
  { key: "section", en: "Section", bn: "শাখা" },
  { key: "roll_number", en: "Roll number", bn: "রোল নম্বর" },
  {
    key: "guardian_relation",
    en: "Guardian relation (father/mother/...)",
    bn: "অভিভাবকের সম্পর্ক",
  },
  { key: "guardian_name", en: "Guardian's name", bn: "অভিভাবকের নাম" },
  {
    key: "guardian_phone",
    en: "Guardian's mobile number",
    bn: "অভিভাবকের মোবাইল নম্বর",
  },
] as const
export type StudentImportColumn = (typeof STUDENT_IMPORT_COLUMNS)[number]["key"]

export const OPTIONAL_IMPORT_COLUMNS: readonly StudentImportColumn[] = [
  "full_name_bn",
  "roll_number",
]

/** Why a row cannot be imported. Upper-case codes come from the database
 * at import time (public.admit_student's named errors). */
export const importRowErrorCodeSchema = z.enum([
  "required",
  "too_long",
  "invalid_date",
  "future_date",
  "invalid_gender",
  "unknown_class",
  "unknown_section",
  "invalid_roll",
  "duplicate_roll",
  "invalid_relation",
  "invalid_phone",
  "VALIDATION",
  "ROLL_TAKEN",
  "SECTION_NOT_FOUND",
  "SECTION_ARCHIVED",
  "YEAR_CLOSED",
  "IDEMPOTENCY_KEY_REUSED",
])
export type ImportRowErrorCode = z.infer<typeof importRowErrorCodeSchema>

const columnKeySchema = z.enum(
  STUDENT_IMPORT_COLUMNS.map((c) => c.key) as [
    StudentImportColumn,
    ...StudentImportColumn[],
  ]
)

export const importRowErrorSchema = z.object({
  column: columnKeySchema.nullable(),
  code: importRowErrorCodeSchema,
})
export type ImportRowError = z.infer<typeof importRowErrorSchema>

/** The `public.admit_student` payload, minus the idempotency key the
 * database derives from (batch, line). */
export const admitPayloadSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  full_name_bn: z.string().nullable(),
  gender: z.enum(["male", "female", "other"]),
  date_of_birth: z.string(),
  section_id: uuidSchema,
  roll_number: z.number().int().nullable(),
  guardian: z.object({
    relation: z.string(),
    full_name: z.string(),
    full_name_bn: z.null(),
    phone: z.string(),
  }),
})
export type AdmitPayload = z.infer<typeof admitPayloadSchema>

export const importReportRowSchema = z.object({
  line: z.number().int().min(2),
  status: z.enum(["valid", "error", "created", "failed"]),
  errors: z.array(importRowErrorSchema),
  /** Present on valid rows: what will be admitted. */
  input: admitPayloadSchema.optional(),
  /** Present on error rows: the cells as typed, so the preview can show them. */
  raw: z.record(z.string(), z.string()).optional(),
  student_code: z.string().optional(),
})
export type ImportReportRow = z.infer<typeof importReportRowSchema>

export const importReportSchema = z.object({
  rows: z.array(importReportRowSchema),
  /** Columns in the file that are not in the template: ignored. */
  ignoredColumns: z.array(z.string()),
})
export type ImportReport = z.infer<typeof importReportSchema>

export type StudentImportBatch = {
  id: string
  filename: string
  status: ImportStatus
  totalRows: number
  validRows: number
  errorRows: number
  createdCount: number
  report: ImportReport
  createdAt: string
  finishedAt: string | null
}

/** A problem with the whole file, before any row is looked at. */
export const importFileErrorCodeSchema = z.enum([
  "no_file",
  "wrong_type",
  "too_large",
  "unreadable",
  "empty",
  "too_many_rows",
  "missing_columns",
])
export type ImportFileErrorCode = z.infer<typeof importFileErrorCodeSchema>

export const commitStudentImportInputSchema = z
  .object({ batchId: uuidSchema })
  .strict()
export type CommitStudentImportInput = z.infer<
  typeof commitStudentImportInputSchema
>
