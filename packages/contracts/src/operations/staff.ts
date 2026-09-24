import { z } from "zod"

import {
  isoDateSchema,
  paisaSchema,
  uuidSchema,
  workspaceIdSchema,
} from "../common"

/**
 * F-OP-06 Part 1 — schema, RLS and the compensation split.
 * Row shapes for `staff_records`, `staff_compensation`, `staff_documents`
 * (`supabase/migrations/20260925000600_staff_schema.sql`), mirrored here so
 * the repository layer (Part 1) and every later Part's server actions share
 * one definition. Endpoint input/output schemas (`createStaffRecord`,
 * `setStaffCompensation`, ...) are NOT modelled yet — those are Parts 2-5,
 * spec §7.
 */

// ---------------------------------------------------------------------------
// Enums — mirror public.staff_employment_type / staff_status /
// staff_document_kind exactly (parity asserted in staff.test.ts).
// ---------------------------------------------------------------------------
export const staffEmploymentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "substitute",
  "volunteer",
])
export type StaffEmploymentType = z.infer<typeof staffEmploymentTypeSchema>

export const staffStatusSchema = z.enum([
  "pending_join",
  "active",
  "on_notice",
  "left",
])
export type StaffStatus = z.infer<typeof staffStatusSchema>

export const staffDocumentKindSchema = z.enum([
  "nid",
  "passport",
  "degree",
  "certificate",
  "contract",
  "appointment_letter",
  "police_clearance",
  "photo",
  "other",
])
export type StaffDocumentKind = z.infer<typeof staffDocumentKindSchema>

// ---------------------------------------------------------------------------
// staff_records — the full row (owner/admin-or-self view, F-OP-06 §3.1).
// The safe `staff_directory` subset is a narrower, separate shape below.
// ---------------------------------------------------------------------------
export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  relation: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).optional(),
})
export type EmergencyContact = z.infer<typeof emergencyContactSchema>

export const qualificationSchema = z.object({
  degree: z.string().trim().min(1).max(200),
  institution: z.string().trim().min(1).max(200).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
})
export type Qualification = z.infer<typeof qualificationSchema>

export const staffRecordSchema = z.object({
  id: uuidSchema,
  workspaceId: workspaceIdSchema,
  userId: uuidSchema.nullable(),
  membershipId: uuidSchema.nullable(),
  staffCode: z.string().min(1),
  fullName: z.string().min(1).max(200),
  designationLabelId: uuidSchema.nullable(),
  department: z.string().nullable(),
  employmentType: staffEmploymentTypeSchema,
  employmentStatus: staffStatusSchema,
  joinedOn: isoDateSchema.nullable(),
  leftOn: isoDateSchema.nullable(),
  workEmail: z.string().nullable(),
  workPhone: z.string().nullable(),
  personalPhone: z.string().nullable(),
  emergencyContact: emergencyContactSchema,
  bloodGroup: z.string().nullable(),
  dateOfBirth: isoDateSchema.nullable(),
  gender: z.string().nullable(),
  nidNumber: z.string().nullable(),
  address: z.string().nullable(),
  qualifications: z.array(qualificationSchema),
  subjectIds: z.array(uuidSchema),
  notes: z.string().nullable(),
  applicationId: uuidSchema.nullable(),
})
export type StaffRecord = z.infer<typeof staffRecordSchema>

/** `public.staff_directory` (F-OP-06 §3.1) — the subset every non-parent
 * active member may read. Never carries compensation, NID or documents. */
export const staffDirectoryRowSchema = z.object({
  id: uuidSchema,
  workspaceId: workspaceIdSchema,
  userId: uuidSchema.nullable(),
  staffCode: z.string(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  designationLabelId: uuidSchema.nullable(),
  designationLabel: z.string().nullable(),
  baseRole: z.enum(["owner", "admin", "teacher", "staff"]).nullable(),
  department: z.string().nullable(),
  subjectIds: z.array(uuidSchema),
  workEmail: z.string().nullable(),
  workPhone: z.string().nullable(),
  employmentStatus: staffStatusSchema,
  joinedOn: isoDateSchema.nullable(),
})
export type StaffDirectoryRow = z.infer<typeof staffDirectoryRowSchema>

// ---------------------------------------------------------------------------
// staff_compensation (F-OP-06 §3.2) — owner/admin, or the row's own person.
// ---------------------------------------------------------------------------
export const staffCompensationSchema = z.object({
  id: uuidSchema,
  workspaceId: workspaceIdSchema,
  staffRecordId: uuidSchema,
  hourlyRatePaisa: paisaSchema.nullable(),
  monthlySalaryPaisa: paisaSchema.nullable(),
  currency: z.literal("BDT"),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
  note: z.string().nullable(),
})
export type StaffCompensation = z.infer<typeof staffCompensationSchema>

// ---------------------------------------------------------------------------
// staff_documents (F-OP-06 §3.3)
// ---------------------------------------------------------------------------
export const staffDocumentSchema = z.object({
  id: uuidSchema,
  workspaceId: workspaceIdSchema,
  staffRecordId: uuidSchema,
  kind: staffDocumentKindSchema,
  fileId: uuidSchema,
  label: z.string().nullable(),
  issuedOn: isoDateSchema.nullable(),
  expiresOn: isoDateSchema.nullable(),
  verifiedBy: uuidSchema.nullable(),
  verifiedAt: z.string().nullable(),
  uploadedBy: uuidSchema.nullable(),
})
export type StaffDocument = z.infer<typeof staffDocumentSchema>
