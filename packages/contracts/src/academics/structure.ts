import { z } from "zod"

import { uuidSchema } from "../common"
import { gradeStageSchema } from "../identity/school"

/**
 * F-AC-01 demo cut (D-102) — sections and the subject catalogue. Enums
 * mirror `public.subject_category` / `public.subject_kind`
 * (20260925300304_sections_and_subjects.sql).
 */

export const subjectCategorySchema = z.enum([
  "core",
  "optional",
  "religion",
  "co_curricular",
])
export type SubjectCategory = z.infer<typeof subjectCategorySchema>

export const subjectKindSchema = z.enum(["compulsory", "optional_fourth"])
export type SubjectKind = z.infer<typeof subjectKindSchema>

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export const sectionSchema = z.object({
  id: uuidSchema,
  gradeLevelId: uuidSchema,
  name: z.string(),
  classTeacherId: uuidSchema.nullable(),
  classTeacherName: z.string().nullable(),
  room: z.string().nullable(),
  capacity: z.number().int().nullable(),
  /** F-AC-01 Part 5 demo cut (D-107): the subjects this section takes and
   * each one's teacher. Names come from the subject list and teacher list. */
  subjects: z.array(
    z.object({ subjectId: uuidSchema, teacherId: uuidSchema.nullable() })
  ),
})
export type Section = z.infer<typeof sectionSchema>

export const gradeWithSectionsSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  nameBn: z.string(),
  levelNumber: z.number().int(),
  stage: gradeStageSchema.nullable(),
  sections: z.array(sectionSchema),
})
export type GradeWithSections = z.infer<typeof gradeWithSectionsSchema>

export const subjectSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  nameBn: z.string().nullable(),
  code: z.string().nullable(),
  category: subjectCategorySchema,
  subjectKind: subjectKindSchema,
})
export type Subject = z.infer<typeof subjectSchema>

/** A member who may be a class teacher (F-AC-01 §5 rule 9). */
export const teacherOptionSchema = z.object({
  memberId: uuidSchema,
  name: z.string(),
})
export type TeacherOption = z.infer<typeof teacherOptionSchema>

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()

/** §4.2 "Add a section": always in the school's current academic year. */
export const createSectionInputSchema = z
  .object({
    gradeLevelId: uuidSchema,
    name: z.string().trim().min(1).max(20),
    classTeacherId: uuidSchema.nullable().optional(),
    room: optionalTrimmed(40),
    capacity: z.number().int().min(1).max(500).nullable().optional(),
  })
  .strict()
export type CreateSectionInput = z.infer<typeof createSectionInputSchema>

export const archiveSectionInputSchema = z
  .object({ sectionId: uuidSchema })
  .strict()
export type ArchiveSectionInput = z.infer<typeof archiveSectionInputSchema>

export const createSubjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    nameBn: optionalTrimmed(80),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,12}$/, "Letters, digits and dashes, up to 12")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    category: subjectCategorySchema,
    subjectKind: subjectKindSchema,
  })
  .strict()
export type CreateSubjectInput = z.infer<typeof createSubjectInputSchema>

/** F-AC-01 Part 5 demo cut (D-107): a section's whole subject list, each
 * subject with its teacher (or none). Subjects left out are taken off. */
export const setSectionSubjectsInputSchema = z
  .object({
    sectionId: uuidSchema,
    subjects: z
      .array(
        z
          .object({ subjectId: uuidSchema, teacherId: uuidSchema.nullable() })
          .strict()
      )
      .max(40)
      .refine(
        (rows) => new Set(rows.map((r) => r.subjectId)).size === rows.length,
        "Each subject once"
      ),
  })
  .strict()
export type SetSectionSubjectsInput = z.infer<
  typeof setSectionSubjectsInputSchema
>

/** A section the signed-in member teaches this year (D-107): as its class
 * teacher, as the teacher of one or more of its subjects, or both. Read by
 * the basic-mode home (F-ID-10 Part 2). */
export const mySectionSchema = z.object({
  sectionId: uuidSchema,
  sectionName: z.string(),
  gradeLevelId: uuidSchema,
  gradeName: z.string(),
  gradeNameBn: z.string(),
  levelNumber: z.number().int(),
  isClassTeacher: z.boolean(),
  /** The subjects they teach in this section, by name; empty when they are
   * only its class teacher. */
  subjects: z.array(
    z.object({
      subjectId: uuidSchema,
      name: z.string(),
      nameBn: z.string().nullable(),
    })
  ),
})
export type MySection = z.infer<typeof mySectionSchema>
