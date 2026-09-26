import { z } from "zod"

import {
  apiError,
  err,
  ok,
  type ApiError,
  type CreateExamParsed,
  type ExamDetail,
  type ExamSummary,
  type Result,
  type SetExamStatusInput,
  type UpdateExamSubjectInput,
} from "@acadigma/contracts"
import { sectionDisplayName } from "@acadigma/domain/academic"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

/**
 * F-AC-06 Part 2 (demo cut, D-303). Reads through RLS (owner/admin/teacher/
 * staff); writes are owner/admin by RLS, with the grading snapshot and the
 * §5.12 status chain enforced by triggers in `20260925300305_exams.sql`.
 */

const UNAVAILABLE = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)
const NOT_FOUND = apiError("not_found", "That exam does not exist.")

/** Codes the database raises by name, mapped to the envelope. */
const DB_ERRORS: Record<string, ApiError> = {
  NO_GRADE_SCALE: apiError(
    "validation_failed",
    "Set up a grade scale in Settings → Grading before creating an exam.",
    { fieldErrors: { gradeScale: ["NO_GRADE_SCALE"] } }
  ),
  SECTION_WRONG_YEAR: apiError(
    "validation_failed",
    "Every section must belong to the exam's academic year."
  ),
  INVALID_TRANSITION: apiError(
    "conflict",
    "That status change is not allowed from the exam's current status."
  ),
  EXAM_LOCKED: apiError(
    "conflict",
    "Marks entry has opened: papers' marks and sections can no longer change."
  ),
  EXAM_YEAR_IMMUTABLE: apiError(
    "validation_failed",
    "An exam cannot move to another academic year."
  ),
  MARKS_INCOMPLETE: apiError(
    "conflict",
    "Every student in every paper needs a mark, or Absent or Exempt, before results can be published.",
    { fieldErrors: { _root: ["MARKS_INCOMPLETE"] } }
  ),
  REASON_REQUIRED: apiError(
    "validation_failed",
    "Give a reason for going back a step.",
    { fieldErrors: { reason: ["REASON_REQUIRED"] } }
  ),
}

function fromDbError(error: { message: string; code?: string }): ApiError {
  if (Object.hasOwn(DB_ERRORS, error.message)) {
    return DB_ERRORS[error.message] ?? UNAVAILABLE
  }
  if (error.code === "23505") {
    return apiError(
      "conflict",
      "An exam with that name already exists this year.",
      {
        fieldErrors: { name: ["NAME_TAKEN"] },
      }
    )
  }
  return UNAVAILABLE
}

const summaryRow = z.object({
  id: z.string(),
  name: z.string(),
  exam_type: z.string(),
  status: z.string(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  exam_subjects: z.array(z.object({ count: z.number() })),
})

export async function listExams(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  academicYearId: string
): Promise<Result<ExamSummary[], ApiError>> {
  const { data, error } = await client
    .from("exams")
    .select(
      "id, name, exam_type, status, starts_on, ends_on, exam_subjects(count)"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("academic_year_id", academicYearId)
    .order("starts_on", { ascending: false, nullsFirst: true })
  if (error) return err(UNAVAILABLE)
  const rows = z.array(summaryRow).safeParse(data ?? [])
  if (!rows.success) return err(UNAVAILABLE)
  return ok(
    rows.data.map((r) => ({
      id: r.id,
      name: r.name,
      examType: r.exam_type as ExamSummary["examType"],
      status: r.status as ExamSummary["status"],
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      paperCount: r.exam_subjects[0]?.count ?? 0,
    }))
  )
}

const detailRow = summaryRow.omit({ exam_subjects: true }).extend({
  status_reason: z.string().nullable(),
  grading_snapshot: z.object({
    grade_scale_name: z.string().optional(),
    pass_mark_percent: z.coerce.number().optional(),
  }),
  exam_subjects: z.array(
    z.object({
      id: z.string(),
      section_id: z.string(),
      exam_date: z.string().nullable(),
      full_marks: z.coerce.number(),
      pass_marks: z.coerce.number(),
      status: z.string(),
      teacher_id: z.string().nullable(),
      entry_opens_on: z.string().nullable(),
      entry_closes_on: z.string().nullable(),
      status_reason: z.string().nullable(),
      subjects: z.object({ name: z.string(), name_bn: z.string().nullable() }),
      sections: z.object({
        name: z.string(),
        grade_levels: z.object({ name: z.string(), level_number: z.number() }),
      }),
    })
  ),
})

export async function getExam(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  examId: string
): Promise<Result<ExamDetail, ApiError>> {
  const { data, error } = await client
    .from("exams")
    .select(
      "id, name, exam_type, status, starts_on, ends_on, status_reason, grading_snapshot, " +
        "exam_subjects(id, section_id, exam_date, full_marks, pass_marks, status, teacher_id, " +
        "entry_opens_on, entry_closes_on, status_reason, " +
        "subjects(name, name_bn), sections(name, grade_levels(name, level_number)))"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", examId)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) return err(NOT_FOUND)
  const row = detailRow.safeParse(data)
  if (!row.success) return err(UNAVAILABLE)
  const r = row.data
  const progress = await marksProgress(ctx, client, r.id)
  if (!progress.ok) return progress
  const papers = r.exam_subjects
    .map((p) => ({
      id: p.id,
      sectionId: p.section_id,
      sectionLabel: sectionDisplayName(
        p.sections.grade_levels.name,
        p.sections.name
      ),
      level: p.sections.grade_levels.level_number,
      subjectName: p.subjects.name,
      subjectNameBn: p.subjects.name_bn,
      examDate: p.exam_date,
      fullMarks: p.full_marks,
      passMarks: p.pass_marks,
      status: p.status as ExamDetail["papers"][number]["status"],
      teacherId: p.teacher_id,
      entryOpensOn: p.entry_opens_on,
      entryClosesOn: p.entry_closes_on,
      statusReason: p.status_reason,
      marksDone: progress.data[p.id]?.marked ?? 0,
      enrolled: progress.data[p.id]?.enrolled ?? 0,
    }))
    .sort(
      (a, b) =>
        a.level - b.level ||
        a.sectionLabel.localeCompare(b.sectionLabel) ||
        a.subjectName.localeCompare(b.subjectName)
    )
    .map(({ level: _level, ...paper }) => paper)
  return ok({
    id: r.id,
    name: r.name,
    examType: r.exam_type as ExamDetail["examType"],
    status: r.status as ExamDetail["status"],
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    paperCount: papers.length,
    statusReason: r.status_reason,
    gradeScaleName: r.grading_snapshot.grade_scale_name ?? null,
    passMarkPercent: r.grading_snapshot.pass_mark_percent ?? null,
    papers,
  })
}

/**
 * Per paper: students actively enrolled now, and how many of them have a
 * mark, absent or exempt — counted in SQL by `public.exam_marks_progress`,
 * the same definition as the publish gate (D-304).
 */
async function marksProgress(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  examId: string
): Promise<
  Result<Record<string, { enrolled: number; marked: number }>, ApiError>
> {
  const { data, error } = await client.rpc("exam_marks_progress", {
    p_workspace_id: ctx.workspaceId,
    p_exam_id: examId,
  })
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? {}) as unknown as Record<
      string,
      { enrolled: number; marked: number }
    >
  )
}

/** `public.create_exam` — exam, sections and papers in one transaction. */
export async function createExam(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: CreateExamParsed
): Promise<Result<{ examId: string }, ApiError>> {
  const { data, error } = await client.rpc("create_exam", {
    p_input: {
      workspace_id: ctx.workspaceId,
      academic_year_id: input.academicYearId,
      name: input.name,
      exam_type: input.examType,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      section_ids: input.sectionIds,
      subject_ids: input.subjectIds,
      full_marks: input.fullMarks,
    },
  })
  if (error) return err(fromDbError(error))
  return ok({ examId: String(data) })
}

export async function setExamStatus(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: SetExamStatusInput
): Promise<Result<void, ApiError>> {
  const { data, error } = await client
    .from("exams")
    .update({ status: input.status, status_reason: input.reason ?? null })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", input.examId)
    .select("id")
  if (error) return err(fromDbError(error))
  if (!data || data.length === 0) return err(NOT_FOUND)
  return ok(undefined)
}

export async function updateExamSubject(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient,
  input: UpdateExamSubjectInput
): Promise<Result<void, ApiError>> {
  const { data, error } = await client
    .from("exam_subjects")
    .update({
      exam_date: input.examDate,
      full_marks: input.fullMarks,
      pass_marks: input.passMarks,
      // Omitted = leave the teacher as is; null clears it.
      ...(input.teacherId !== undefined ? { teacher_id: input.teacherId } : {}),
      ...(input.entryOpensOn !== undefined
        ? { entry_opens_on: input.entryOpensOn }
        : {}),
      ...(input.entryClosesOn !== undefined
        ? { entry_closes_on: input.entryClosesOn }
        : {}),
    })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", input.id)
    .select("id")
  if (error) return err(fromDbError(error))
  if (!data || data.length === 0) {
    return err(apiError("not_found", "That paper does not exist."))
  }
  return ok(undefined)
}
