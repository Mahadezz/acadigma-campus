import { z } from "zod"

import { uuidSchema } from "../common"
import { examSubjectStatusSchema } from "../academics/exams"

/**
 * F-ID-10 Part 3 (§4.5, §7 `getClassHub`) — the class hub: one section's
 * Attendance/Marks/Students/Print, gated by whether the caller may open
 * this section at all (a stricter check than any one tab's own permission
 * — §2 footnote ²/D-405).
 */

export const classHubQuerySchema = z.object({ sectionId: uuidSchema })
export type ClassHubQuery = z.infer<typeof classHubQuerySchema>

/** §8 Part 3: only the tabs this Part actually ships. A later Part that
 * ships a class-shaped screen (routine, handouts, lesson plan…) adds its
 * own id here and its own entry in `CLASS_HUB_TABS`
 * (`@acadigma/domain/class-hub`) in its own PR — never a placeholder for a
 * tab with no page. */
export const classHubTabIdSchema = z.enum([
  "attendance",
  "marks",
  "students",
  "print",
])
export type ClassHubTabId = z.infer<typeof classHubTabIdSchema>

export const classHubSchema = z.object({
  section: z.object({
    id: uuidSchema,
    name: z.string(),
    gradeName: z.string(),
    gradeNameBn: z.string(),
  }),
  studentCount: z.number().int().nonnegative(),
  tabs: z.array(classHubTabIdSchema),
})
export type ClassHub = z.infer<typeof classHubSchema>

/**
 * One row of the Marks tab (§8 Part 3: "this section's papers the user
 * teaches with n/N entered, submitted/locked"). `examSubjectId` is the
 * paper id the existing `/app/marks/[examSubjectId]` screen already keys
 * on — this tab adds no new entry screen, only a way to find one.
 */
export const sectionPaperSchema = z.object({
  examSubjectId: uuidSchema,
  examId: uuidSchema,
  examName: z.string(),
  subjectName: z.string(),
  subjectNameBn: z.string().nullable(),
  status: examSubjectStatusSchema,
  marksDone: z.number().int(),
  enrolled: z.number().int(),
})
export type SectionPaper = z.infer<typeof sectionPaperSchema>

/**
 * The Print tab's exam: "the latest published or computed exam" (§8 Part
 * 3) for this section — `exams.status` of `marks_locked` (results computed,
 * not yet published) or `published`.
 */
export const sectionPrintExamSchema = z.object({
  examId: uuidSchema,
  examName: z.string(),
  status: z.enum(["marks_locked", "published"]),
})
export type SectionPrintExam = z.infer<typeof sectionPrintExamSchema>
