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
  type MySection,
  type Result,
  type Section,
  type SetSectionSubjectsInput,
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
  section_subjects?: { subject_id: string; teacher_id: string | null }[]
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
    subjects: (row.section_subjects ?? []).map((ss) => ({
      subjectId: ss.subject_id,
      teacherId: ss.teacher_id,
    })),
  }
}

const SECTION_COLUMNS =
  "id, grade_level_id, name, class_teacher_id, room, capacity, " +
  "section_subjects(subject_id, teacher_id), " +
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

/** F-AC-01 Part 5 demo cut (D-107): replace a live section's subject list,
 * each subject with its teacher. `public.set_section_subjects` (SECURITY
 * INVOKER) does it in one transaction; RLS and triggers re-check. */
export async function setSectionSubjects(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  input: SetSectionSubjectsInput
): Promise<Result<{ count: number }, ApiError>> {
  const { data, error } = await supabase.rpc("set_section_subjects", {
    p_workspace_id: ctx.workspaceId,
    p_section_id: input.sectionId,
    p_subjects: input.subjects.map((s) => ({
      subject_id: s.subjectId,
      teacher_id: s.teacherId,
    })),
  })
  if (error) {
    if (error.message === "SECTION_NOT_FOUND") {
      return err(apiError("not_found", "That section no longer exists."))
    }
    if (
      error.message === "MEMBER_NOT_ELIGIBLE" ||
      error.message.includes("section_subjects_teacher_fkey")
    ) {
      return err(
        apiError(
          "validation_failed",
          "Pick an active teacher of this school.",
          {
            fieldErrors: { teacherId: ["MEMBER_NOT_ELIGIBLE"] },
          }
        )
      )
    }
    if (error.code === "23503") {
      return err(
        apiError(
          "validation_failed",
          "That subject does not belong to this school."
        )
      )
    }
    return err(UNAVAILABLE)
  }
  return ok({ count: data ?? 0 })
}

type MySectionRow = {
  id: string
  name: string
  class_teacher_id: string | null
  grade_levels: {
    id: string
    name: string
    name_bn: string
    level_number: number
  } | null
}

const MY_SECTION_COLUMNS =
  "id, name, class_teacher_id, grade_levels!sections_grade_level_fkey(id, name, name_bn, level_number)"

/**
 * The live sections of the current year that the signed-in member teaches
 * (D-107): as class teacher, as a subject teacher (`section_subjects`), or
 * both, with the subjects they teach there. Ordered by grade, then section.
 * An owner/admin gets only their own classes here, like everyone else; the
 * "All classes" block is the caller's business (D-403 (b)).
 */
export async function listMySections(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<MySection[], ApiError>> {
  const [year, member] = await Promise.all([
    currentYear(supabase, ctx),
    supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .maybeSingle(),
  ])
  if (!year.ok) return year
  if (member.error) return err(UNAVAILABLE)
  if (!year.data || !member.data) return ok([])
  const memberId = member.data.id

  const [asClassTeacher, asSubjectTeacher] = await Promise.all([
    supabase
      .from("sections")
      .select(MY_SECTION_COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .eq("academic_year_id", year.data.id)
      .eq("class_teacher_id", memberId)
      .is("archived_at", null),
    supabase
      .from("section_subjects")
      .select(
        `subject_id, subjects!section_subjects_subject_fkey(name, name_bn), sections!section_subjects_section_fkey!inner(${MY_SECTION_COLUMNS})`
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("teacher_id", memberId)
      .eq("sections.academic_year_id", year.data.id)
      .is("sections.archived_at", null),
  ])
  if (asClassTeacher.error || asSubjectTeacher.error) return err(UNAVAILABLE)

  const bySection = new Map<string, MySection>()
  const add = (row: MySectionRow): MySection => {
    const existing = bySection.get(row.id)
    if (existing) return existing
    const section: MySection = {
      sectionId: row.id,
      sectionName: row.name,
      gradeLevelId: row.grade_levels?.id ?? "",
      gradeName: row.grade_levels?.name ?? "",
      gradeNameBn: row.grade_levels?.name_bn ?? "",
      levelNumber: row.grade_levels?.level_number ?? 0,
      isClassTeacher: row.class_teacher_id === memberId,
      subjects: [],
    }
    bySection.set(row.id, section)
    return section
  }
  for (const row of asClassTeacher.data as unknown as MySectionRow[]) add(row)
  const subjectRows = asSubjectTeacher.data as unknown as {
    subject_id: string
    subjects: { name: string; name_bn: string | null } | null
    sections: MySectionRow | null
  }[]
  for (const row of subjectRows) {
    if (!row.sections) continue
    add(row.sections).subjects.push({
      subjectId: row.subject_id,
      name: row.subjects?.name ?? "",
      nameBn: row.subjects?.name_bn ?? null,
    })
  }

  return ok(
    [...bySection.values()]
      .map((section) => ({
        ...section,
        subjects: section.subjects.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort(
        (a, b) =>
          a.levelNumber - b.levelNumber ||
          a.sectionName.localeCompare(b.sectionName)
      )
  )
}
