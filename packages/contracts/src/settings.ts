import { z } from "zod"

import { timeOfDaySchema } from "./common"
import {
  eiinSchema,
  schoolBoardSchema,
  schoolMediumSchema,
} from "./identity/school"

/**
 * The Zod schema of record for `school_profiles`' five jsonb policy blobs
 * (DATA-MODEL.md §1.3, F-OP-07 §3, §5.1). `packages/domain/settings/resolve.ts`
 * merges a school's stored row onto its defaults defensively (never throwing on a
 * legacy shape); these schemas validate genuinely *new* input at the boundary — a
 * server action patch — where rejecting a bad value outright is the right thing.
 *
 * Every field schema here is written without `.default()` on purpose: the "field"
 * schemas below back both a full/resolved shape (all keys required) and a partial
 * patch shape (`.partial()`), and a default would silently backfill an omitted key
 * in the patch — defeating "only the supplied keys change".
 */

const attendancePolicyFields = z.object({
  mode: z.enum(["daily", "period"]),
  cutoff: timeOfDaySchema,
  late_counts_present: z.boolean(),
  half_day_counts_present: z.boolean(),
  /** Basis points: 7500 = 75 %. */
  min_attendance_bp: z.number().int().min(0).max(10_000),
  block_exam_on_shortfall: z.boolean(),
})
export const schoolAttendancePolicySchema = attendancePolicyFields
export const schoolAttendancePolicyPatchSchema =
  attendancePolicyFields.partial()
export type SchoolAttendancePolicy = z.infer<
  typeof schoolAttendancePolicySchema
>

const academicSettingsFields = z.object({
  grade_scale_code: z.string().min(1).max(50),
  pass_mark_percent: z.number().int().min(0).max(100),
  fail_any_subject_zero_gpa: z.boolean(),
  rank_by: z.string().min(1).max(50),
  /** exam id -> weight; opaque map, DATA-MODEL.md §1.3. */
  exam_weights: z.record(z.string(), z.number()),
})
export const schoolAcademicSettingsSchema = academicSettingsFields
export const schoolAcademicSettingsPatchSchema =
  academicSettingsFields.partial()
export type SchoolAcademicSettings = z.infer<
  typeof schoolAcademicSettingsSchema
>

const coverPolicyFields = z.object({
  missed_punch_grace_minutes: z.number().int().min(0).max(240),
  enable_missed_punch: z.boolean(),
  cover_credited: z.boolean(),
  unpaid_absence: z.boolean(),
})
export const schoolCoverPolicySchema = coverPolicyFields
export const schoolCoverPolicyPatchSchema = coverPolicyFields.partial()
export type SchoolCoverPolicy = z.infer<typeof schoolCoverPolicySchema>

const messagingPolicyFields = z.object({
  parents_can_reply: z.boolean(),
  announcement_roles: z.array(z.string().min(1)).min(1),
  /** opaque per-role/day schedule; no fixed shape yet, DATA-MODEL.md §1.3. */
  quiet_hours: z.record(z.string(), z.unknown()),
})
export const schoolMessagingPolicySchema = messagingPolicyFields
export const schoolMessagingPolicyPatchSchema = messagingPolicyFields.partial()
export type SchoolMessagingPolicy = z.infer<typeof schoolMessagingPolicySchema>

const brandingFields = z.object({
  logo_file_id: z.string().uuid().nullable(),
  header_line_1: z.string().max(200).nullable(),
  header_line_2: z.string().max(200).nullable(),
  accent: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Expected a hex colour, e.g. #1F4E79")
    .nullable(),
  report_footer: z.string().max(500).nullable(),
})
export const schoolBrandingSchema = brandingFields
export const schoolBrandingPatchSchema = brandingFields.partial()
export type SchoolBranding = z.infer<typeof schoolBrandingSchema>

/**
 * Input to `updateSchoolSettings`: every top-level section is optional (patch only
 * what changed) and, once present, only the keys being changed need to be supplied
 * — `resolve()` fills the rest from the shipped defaults when the row is next read.
 * Unknown top-level keys are rejected (`.strict()`): this is new client input, not
 * a legacy DB row, so failing loudly is correct here.
 */
export const schoolSettingsPatchSchema = z
  .object({
    // Deliberately not the shared `timezoneSchema` — its `.default("Asia/Dhaka")`
    // would backfill an omitted key on a patch, which is exactly what a partial
    // patch must not do (see the file header note).
    timezone: z.string().min(1).optional(),
    working_days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .optional(),
    attendance_policy: schoolAttendancePolicyPatchSchema.optional(),
    academic_settings: schoolAcademicSettingsPatchSchema.optional(),
    cover_policy: schoolCoverPolicyPatchSchema.optional(),
    messaging_policy: schoolMessagingPolicyPatchSchema.optional(),
    branding: schoolBrandingPatchSchema.optional(),
  })
  .strict()
export type SchoolSettingsPatch = z.infer<typeof schoolSettingsPatchSchema>

// ---------------------------------------------------------------------------
// F-OP-07 Part 1 — school profile + branding (§4 W2, §7 `updateSchoolProfile`,
// `updateBranding`). Typed `school_profiles` columns (DATA-MODEL.md §1.3).
// Board/medium reuse the wizard's enums (identity/school.ts) so the two screens
// that write these columns cannot disagree.
// ---------------------------------------------------------------------------

/** F-OP-07 §3.1 `school_type`. */
export const schoolTypeSchema = z.enum([
  "government",
  "private",
  "mpo",
  "international",
  "madrasa",
  "kindergarten",
  "other",
])
export type SchoolType = z.infer<typeof schoolTypeSchema>

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable()

export const schoolProfileFieldsSchema = z.object({
  legal_name: optionalText(200),
  eiin: eiinSchema.nullable(),
  board: schoolBoardSchema,
  school_type: schoolTypeSchema.nullable(),
  medium: schoolMediumSchema,
  motto: optionalText(200),
  address_line1: optionalText(200),
  address_line2: optionalText(200),
  city: z.string().trim().min(1).max(100),
  district: optionalText(100),
  postal_code: optionalText(20),
  contact_email: z.string().trim().toLowerCase().email().max(200).nullable(),
  contact_phone: optionalText(30),
  website: z.string().trim().url().max(200).nullable(),
  bin_number: optionalText(50),
  vat_number: optionalText(50),
})
export type SchoolProfileFields = z.infer<typeof schoolProfileFieldsSchema>

/**
 * `updated_at` of the row the editor loaded — the optimistic-concurrency
 * version (§7: "a conflict returns stale_version with the current value").
 */
const versionSchema = z.string().min(1)

/** Only the changed fields travel; `.strict()` rejects unknown columns. */
export const updateSchoolProfileInputSchema = z
  .object({
    version: versionSchema,
    profile: schoolProfileFieldsSchema.partial().strict(),
  })
  .strict()
export type UpdateSchoolProfileInput = z.infer<
  typeof updateSchoolProfileInputSchema
>

/** Branding minus `logo_file_id`: logo upload is deferred (D-200). */
export const updateBrandingInputSchema = z
  .object({
    version: versionSchema,
    branding: schoolBrandingPatchSchema.omit({ logo_file_id: true }).strict(),
  })
  .strict()
export type UpdateBrandingInput = z.infer<typeof updateBrandingInputSchema>
