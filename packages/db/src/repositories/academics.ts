/**
 * F-AC-01 demo cut (D-102) — the current academic year's grade levels and
 * sections, the subject catalogue, and the writes the Classes screen makes.
 * Every function takes `WorkspaceContext` first and filters on
 * `ctx.workspaceId`; RLS (class T2) is the second wall.
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type CreateSectionInput,
  type CreateSubjectInput,
  type GradeWithSections,
  type Result,
  type Section,
  type Subject,
  type TeacherOption,
} from "@acadigma/contracts"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

const NO_YEAR: ApiError = apiError(
  "not_found",
  "This school has no current academic year yet."
)

export type ClassesOverview = {
  year: { id: string; name: string } | null
  grades: GradeWithSections[]
}

type SectionRow = {
  id: string
  grade_level_id: string
  name: string
  class_teacher_id: string | null
  room: string | null
  capacity: number | null
  class_teacher: { profiles: { full_name: string | null } | null } | null
}

function toSection(row: SectionRow): Section {
  return {
    id: row.id,
    gradeLevelId: row.grade_level_id,
    name: row.name,
    classTeacherId: row.class_teacher_id,
    classTeacherName: row.class_teacher?.profiles?.full_name?.trim() || null,
    room: row.room,
    capacity: row.capacity,
  }
}

const SECTION_COLUMNS =
  "id, grade_level_id, name, class_teacher_id, room, capacity, " +
  "class_teacher:workspace_members!sections_class_teacher_fkey(profiles!workspace_members_user_id_fkey(full_name))"

async function currentYear(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<{ id: string; name: string } | null, ApiError>> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("workspace_id", ctx.workspaceId)
    .eq("is_current", true)
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  return ok(data)
}

/** §6 "Classes (grades)": every grade level in order, with this year's
 * live (not archived) sections. */
export async function getClassesOverview(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<ClassesOverview, ApiError>> {
  const year = await currentYear(supabase, ctx)
  if (!year.ok) return year

  const { data: grades, error: gradesError } = await supabase
    .from("grade_levels")
    .select("id, name, name_bn, level_number, stage")
    .eq("workspace_id", ctx.workspaceId)
    .order("level_number")
  if (gradesError) return err(UNAVAILABLE)

  let sections: Section[] = []
  if (year.data) {
    const { data, error } = await supabase
      .from("sections")
      .select(SECTION_COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .eq("academic_year_id", year.data.id)
      .is("archived_at", null)
      .order("name")
    if (error) return err(UNAVAILABLE)
    sections = (data as unknown as SectionRow[]).map(toSection)
  }

  return ok({
    year: year.data,
    grades: (grades ?? []).map((grade) => ({
      id: grade.id,
      name: grade.name,
      nameBn: grade.name_bn,
      levelNumber: grade.level_number,
      stage: grade.stage,
      sections: sections.filter((s) => s.gradeLevelId === grade.id),
    })),
  })
}

/** §5 rule 9: active owners, admins and teachers, by name. */
export async function listClassTeacherOptions(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<TeacherOption[], ApiError>> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, profiles!workspace_members_user_id_fkey(full_name)")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "teacher"])
  if (error) return err(UNAVAILABLE)
  const rows = data as unknown as {
    id: string
    profiles: { full_name: string | null } | null
  }[]
  return ok(
    rows
      .map((row) => ({
        memberId: row.id,
        name: row.profiles?.full_name?.trim() || "—",
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  )
}

export async function createSection(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: CreateSectionInput
): Promise<Result<Section, ApiError>> {
  const year = await currentYear(supabase, ctx)
  if (!year.ok) return year
  if (!year.data) return err(NO_YEAR)

  const { data, error } = await supabase
    .from("sections")
    .insert({
      workspace_id: ctx.workspaceId,
      academic_year_id: year.data.id,
      grade_level_id: input.gradeLevelId,
      name: input.name,
      class_teacher_id: input.classTeacherId ?? null,
      room: input.room ?? null,
      capacity: input.capacity ?? null,
      created_by: ctx.userId,
    })
    .select(SECTION_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505" && error.message.includes("class_teacher")) {
      return err(
        apiError(
          "conflict",
          "That teacher is already a class teacher this year.",
          {
            fieldErrors: { classTeacherId: ["CLASS_TEACHER_TAKEN"] },
          }
        )
      )
    }
    if (error.code === "23505") {
      return err(
        apiError(
          "conflict",
          "This class already has a section with that name.",
          {
            fieldErrors: { name: ["SECTION_NAME_TAKEN"] },
          }
        )
      )
    }
    if (
      error.message === "MEMBER_NOT_ELIGIBLE" ||
      (error.code === "23503" &&
        error.message.includes("sections_class_teacher_fkey"))
    ) {
      return err(
        apiError(
          "validation_failed",
          "Pick an active teacher of this school.",
          {
            fieldErrors: { classTeacherId: ["MEMBER_NOT_ELIGIBLE"] },
          }
        )
      )
    }
    if (error.code === "23503") {
      // The grade (or year) is not this school's: nothing the form can fix.
      return err(
        apiError(
          "validation_failed",
          "That class does not belong to this school."
        )
      )
    }
    return err(UNAVAILABLE)
  }
  return ok(toSection(data as unknown as SectionRow))
}

/** §4.4: archive, never delete (history keeps pointing at it). */
export async function archiveSection(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string
): Promise<Result<{ id: string }, ApiError>> {
  const { data, error } = await supabase
    .from("sections")
    .update({ archived_at: new Date().toISOString() })
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", sectionId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle()
  if (error) return err(UNAVAILABLE)
  if (!data) {
    return err(apiError("not_found", "That section no longer exists."))
  }
  return ok({ id: data.id })
}

export async function listSubjects(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<Subject[], ApiError>> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, name_bn, code, category, subject_kind")
    .eq("workspace_id", ctx.workspaceId)
    .is("archived_at", null)
    .order("name")
  if (error) return err(UNAVAILABLE)
  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      nameBn: row.name_bn,
      code: row.code,
      category: row.category,
      subjectKind: row.subject_kind,
    }))
  )
}

export async function createSubjects(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  subjects: readonly CreateSubjectInput[]
): Promise<Result<{ created: number }, ApiError>> {
  if (subjects.length === 0) return ok({ created: 0 })
  const { data, error } = await supabase
    .from("subjects")
    .insert(
      subjects.map((s) => ({
        workspace_id: ctx.workspaceId,
        name: s.name,
        name_bn: s.nameBn ?? null,
        code: s.code ?? null,
        category: s.category,
        subject_kind: s.subjectKind,
        created_by: ctx.userId,
      }))
    )
    .select("id")
  if (error) {
    if (error.code === "23505") {
      return err(
        apiError(
          "conflict",
          "The school already has a subject with that name or code.",
          { fieldErrors: { name: ["SUBJECT_TAKEN"] } }
        )
      )
    }
    return err(UNAVAILABLE)
  }
  return ok({ created: data?.length ?? 0 })
}
