import { z } from "zod"

import { isoDateSchema } from "../common"

/**
 * F-ID-05 §4.3 "Create a school — the wizard" (Part 3: steps 1-2) and §5
 * "Business rules and calculations". The draft
 * `packages/contracts/src/identity/onboarding.ts` saves through
 * `onboarding_progress.draft` is this schema, `.partial()` — see that
 * file's `onboardingDraftSchema`.
 *
 * Board and medium values match the canonical enum
 * `F-ID-03-workspaces-and-membership.md` §3 already names for
 * `school_profiles.board`/`.medium` (currently plain `text` columns,
 * DATA-MODEL.md §1.3 — these Zod enums are the schema of record for the
 * wizard until some Part promotes them to real Postgres enums).
 */

export const schoolBoardSchema = z.enum([
  "dhaka",
  "chattogram",
  "rajshahi",
  "khulna",
  "barishal",
  "sylhet",
  "rangpur",
  "mymensingh",
  "madrasah",
  "technical",
  "cambridge",
  "edexcel",
  "ib",
  "other",
])
export type SchoolBoard = z.infer<typeof schoolBoardSchema>

/** §4.3 step 1: "Bangla / English version / English medium / Madrasah". */
export const schoolMediumSchema = z.enum([
  "bangla",
  "english_version",
  "english",
  "madrasah",
])
export type SchoolMedium = z.infer<typeof schoolMediumSchema>

/**
 * §5: "optional; if present, exactly 6 digits." Uniqueness is a separate
 * check (`checkEiinAvailabilityInputSchema` below, §4.3 step 1's own
 * probe) — a format-only schema cannot know about other schools' rows.
 */
export const eiinSchema = z
  .string()
  .regex(/^\d{6}$/, "EIIN is 6 digits, e.g. 123456")
export type Eiin = z.infer<typeof eiinSchema>

function isKnownIanaTimeZone(timezone: string): boolean {
  try {
    // Throws RangeError for anything Intl does not recognise as a zone.
    new Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** IANA zone name, validated against the runtime's own zone database —
 * §5: "Timezone default Asia/Dhaka." No `.default()` (unlike the shared
 * `timezoneSchema` in `../common`): a draft field must stay silently
 * absent when unset, never backfilled (`schoolSettingsPatchSchema` in
 * `../settings` documents the same reasoning). */
export const schoolTimezoneSchema = z
  .string()
  .min(1)
  .refine(isKnownIanaTimeZone, "Not a recognised timezone")

/** ISO day numbers, 1=Mon..7=Sun (matches `school_profiles.working_days`,
 * DATA-MODEL.md §1.3). The Sat-Thu default is `[6,7,1,2,3,4]`. */
export const workingDaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine(
    (days) => new Set(days).size === days.length,
    "Each day can only be picked once"
  )

const academicYearFields = {
  name: z.string().trim().min(1).max(100),
  starts_on: isoDateSchema,
  ends_on: isoDateSchema,
}

/**
 * Shape only. The day-count/ordering business rule (1-730 days,
 * `ends_on > starts_on`) is deliberately not re-implemented here —
 * `validateAcademicYearRange` (`packages/domain/src/academic/year.ts`) is
 * the one place that owns it, called by the wizard to gate "Continue" with
 * a reason (§6). Rule 4's "Zod at every boundary" covers shape; the
 * business rule stays in domain, same split `../settings.ts` already
 * documents for `school_profiles`' typed columns.
 */
export const academicYearDraftSchema = z.object(academicYearFields)
export type AcademicYearDraft = z.infer<typeof academicYearDraftSchema>

// ---------------------------------------------------------------------------
// Step 1 — Identity
// ---------------------------------------------------------------------------
export const createSchoolStep1Schema = z.object({
  name: z.string().trim().min(2).max(120),
  eiin: eiinSchema.optional(),
  board: schoolBoardSchema,
  medium: schoolMediumSchema,
})
export type CreateSchoolStep1 = z.infer<typeof createSchoolStep1Schema>

// ---------------------------------------------------------------------------
// Step 2 — Where and when
// ---------------------------------------------------------------------------
export const createSchoolStep2Schema = z.object({
  timezone: schoolTimezoneSchema,
  working_days: workingDaysSchema,
  academic_year: academicYearDraftSchema,
})
export type CreateSchoolStep2 = z.infer<typeof createSchoolStep2Schema>

// ---------------------------------------------------------------------------
// The full draft — Part 3's slice of the eventual `CreateSchoolWorkspaceInput`
// (§7), minus `grade_levels`/`logo_url`, which Part 4 adds alongside steps
// 3-4. Every field optional: `saveOnboardingDraft` accepts whatever has
// been filled in so far (§10: "a partially filled draft never fails
// validation"), and `.passthrough()` keeps this wire-compatible with a
// later Part 4 draft that also carries those two fields.
// ---------------------------------------------------------------------------
export const createSchoolDraftSchema = z
  .object({
    name: createSchoolStep1Schema.shape.name,
    eiin: eiinSchema,
    board: schoolBoardSchema,
    medium: schoolMediumSchema,
    timezone: schoolTimezoneSchema,
    working_days: workingDaysSchema,
    academic_year: z.object(academicYearFields).partial(),
  })
  .partial()
  .passthrough()
export type CreateSchoolDraft = z.infer<typeof createSchoolDraftSchema>

// ---------------------------------------------------------------------------
// checkEiinAvailability — Part 3's own probe, ahead of the
// `createSchoolWorkspace` transaction Part 4 builds (§4.3 step 1, AC6:
// "step 1 shows an inline error and ... does not advance").
// ---------------------------------------------------------------------------
export const checkEiinAvailabilityInputSchema = z.object({ eiin: eiinSchema })
export type CheckEiinAvailabilityInput = z.infer<
  typeof checkEiinAvailabilityInputSchema
>

export const checkEiinAvailabilityOutputSchema = z.object({
  available: z.boolean(),
})
export type CheckEiinAvailabilityOutput = z.infer<
  typeof checkEiinAvailabilityOutputSchema
>
