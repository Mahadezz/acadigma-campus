import { z } from "zod"

import { uuidSchema } from "../common"

/**
 * F-AC-02 demo cut (D-103) — students, their guardians and enrolments.
 * Enums mirror 20260925300306_students_and_guardians.sql.
 */

export const studentGenderSchema = z.enum(["male", "female", "other"])
export type StudentGender = z.infer<typeof studentGenderSchema>

export const studentStatusSchema = z.enum([
  "draft",
  "active",
  "inactive",
  "transferred_out",
  "graduated",
  "removed",
])
export type StudentStatus = z.infer<typeof studentStatusSchema>

export const enrollmentStatusSchema = z.enum([
  "active",
  "transferred",
  "withdrawn",
  "completed",
])
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>

export const guardianRelationSchema = z.enum([
  "father",
  "mother",
  "brother",
  "sister",
  "uncle",
  "aunt",
  "grandparent",
  "legal_guardian",
  "other",
])
export type GuardianRelation = z.infer<typeof guardianRelationSchema>

/**
 * §5 rule 8: a Bangladeshi mobile typed any usual way — `01712345678`,
 * `8801712345678`, `+880 1712-345678` — becomes `+8801712345678`. Anything
 * else is returned unchanged for the format check to refuse.
 */
export function normalizeBdPhone(input: string): string {
  const digits = input.replace(/[\s\-()]/g, "")
  const match = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(digits)
  return match ? `+88${match[1]}` : input.trim()
}

export const guardianPhoneSchema = z
  .string()
  .transform(normalizeBdPhone)
  .pipe(
    z
      .string()
      .regex(/^\+8801[3-9]\d{8}$/, "Enter a mobile number like 01712345678")
  )

// ---------------------------------------------------------------------------
// Reads — the roster projection carries no sensitive field (§5.14).
// ---------------------------------------------------------------------------
export const rosterStudentSchema = z.object({
  id: uuidSchema,
  studentCode: z.string(),
  fullName: z.string(),
  fullNameBn: z.string().nullable(),
  gender: studentGenderSchema,
  status: studentStatusSchema,
  sectionId: uuidSchema.nullable(),
  gradeName: z.string().nullable(),
  gradeNameBn: z.string().nullable(),
  sectionName: z.string().nullable(),
  rollNumber: z.number().int().nullable(),
})
export type RosterStudent = z.infer<typeof rosterStudentSchema>

export const guardianSchema = z.object({
  id: uuidSchema,
  relation: guardianRelationSchema,
  fullName: z.string(),
  fullNameBn: z.string().nullable(),
  phone: z.string(),
  isPrimary: z.boolean(),
})
export type Guardian = z.infer<typeof guardianSchema>

/** Only owner/admin and the class teacher get this (RLS, D-103). */
export const studentPrivateSchema = z.object({
  dateOfBirth: z.string(),
  guardians: z.array(guardianSchema),
})
export type StudentPrivate = z.infer<typeof studentPrivateSchema>

export const studentSearchQuerySchema = z.object({
  // NFC: a Bangla name typed with decomposed vowel signs still matches.
  q: z
    .string()
    .trim()
    .max(60)
    .transform((value) => value.normalize("NFC"))
    .optional(),
  sectionId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
})
export type StudentSearchQuery = z.infer<typeof studentSearchQuerySchema>

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
const nameBn = z
  .string()
  .trim()
  .max(120)
  .transform((value) => (value === "" ? null : value.normalize("NFC")))
  .nullable()
  .optional()

/** §4.1 / §7 `QuickAdmitInput`: the required minimum (PRODUCT-DECISIONS 2.11)
 * plus the Bangla name and an optional roll number. */
export const quickAdmitInputSchema = z
  .object({
    idempotencyKey: uuidSchema,
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    fullNameBn: nameBn,
    gender: studentGenderSchema,
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2014-03-09")
      .refine(
        (value) => value >= "1950-01-01" && value <= todayIso(),
        "Enter a real date of birth"
      ),
    sectionId: uuidSchema,
    rollNumber: z.number().int().min(1).max(9999).nullable().optional(),
    guardian: z
      .object({
        relation: guardianRelationSchema,
        fullName: z.string().trim().min(1).max(120),
        fullNameBn: nameBn,
        phone: guardianPhoneSchema,
      })
      .strict(),
  })
  .strict()
export type QuickAdmitInput = z.infer<typeof quickAdmitInputSchema>

export type QuickAdmitResult = {
  studentId: string
  studentCode: string
  rollNumber: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
