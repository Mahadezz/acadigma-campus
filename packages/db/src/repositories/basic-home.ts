/**
 * F-ID-10 Part 2 (§4.4, §7 `getBasicHome`) — the basic-mode home screen.
 * Every read goes through an already-shipped repository or RLS-protected
 * table; the only genuinely new query here is "which sections does this
 * teacher teach a subject in" (`exam_subjects.teacher_id`).
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type BasicHome,
  type Result,
} from "@acadigma/contracts"
import {
  buildClassBlocks,
  buildTodos,
  greetingPeriod,
  type Assignment,
} from "@acadigma/domain/basic-home"
import { clockTimeIn } from "@acadigma/domain/time"

import { getAttendanceDay } from "./attendance"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

type ExamSubjectTeachingRow = {
  section_id: string
  subjects: { name: string; name_bn: string | null } | null
}

/**
 * INTERIM assignment source (F-ID-10 §2 footnote ²): `section_subjects`
 * does not exist yet, so "which sections/subjects does this teacher teach"
 * is approximated from `exam_subjects.teacher_id` (F-AC-06's own stand-in,
 * `20260925300312_marks.sql` line 61: "Stands in for section_subjects.
 * teacher_id until F-AC-01 ships it") plus the sections the caller is the
 * active class teacher of.
 *
 * Lead note (2026-09-26): the identity lane is building `section_subjects`
 * now (migration 300320) and will add `listMySections(ctx)`, returning both
 * assignment kinds together. Kept behind this one function on purpose —
 * swapping to `listMySections` later is a one-line change at the single
 * call site in `getBasicHome`, not a rewrite of the merge/todo logic in
 * `packages/domain/src/basic-home`, which does not know or care which
 * source produced an `Assignment`. See D-405.
 */
async function resolveMyAssignments(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  classTeacherSectionIds: readonly string[]
): Promise<Result<Assignment[], ApiError>> {
  const assignments: Assignment[] = classTeacherSectionIds.map((sectionId) => ({
    sectionId,
    subject: null,
    subjectBn: null,
  }))

  const member = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle()
  if (member.error) return err(UNAVAILABLE)
  const memberId = (member.data as { id: string } | null)?.id
  // No active membership row (should not happen once `requireShell` has
  // already resolved a `WorkspaceContext`) — no subject-teacher rows to add,
  // but the class-teacher assignments above still stand.
  if (!memberId) return ok(assignments)

  const { data, error } = await supabase
    .from("exam_subjects")
    .select("section_id, subjects(name, name_bn)")
    .eq("workspace_id", ctx.workspaceId)
    .eq("teacher_id", memberId)
  if (error) return err(UNAVAILABLE)

  const seen = new Set<string>()
  for (const row of (data ?? []) as unknown as ExamSubjectTeachingRow[]) {
    const subject = row.subjects
    if (!subject) continue
    const key = `${row.section_id}:${subject.name}`
    if (seen.has(key)) continue // the same section/subject can repeat across exams
    seen.add(key)
    assignments.push({
      sectionId: row.section_id,
      subject: subject.name,
      subjectBn: subject.name_bn,
    })
  }
  return ok(assignments)
}

/**
 * §7: `{fullName, greetingPeriod, todayIso, todos, classes, showAllClasses}`
 * — see `packages/contracts/src/identity/basic-home.ts`'s docblock for why
 * this returns raw facts rather than the spec table's single pre-rendered
 * `greeting` string. One round trip each for the Today overview, the
 * caller's own name, the caller's membership id and the subject-teacher
 * rows — no query runs once per class.
 */
export async function getBasicHome(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<BasicHome, ApiError>> {
  const [day, profile] = await Promise.all([
    getAttendanceDay(supabase, ctx),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle(),
  ])
  if (!day.ok) return day
  if (profile.error) return err(UNAVAILABLE)

  const classTeacherSectionIds = day.data.sections
    .filter((s) => s.isMine)
    .map((s) => s.sectionId)
  const assignments = await resolveMyAssignments(
    supabase,
    ctx,
    classTeacherSectionIds
  )
  if (!assignments.ok) return assignments

  const sectionsById = new Map(day.data.sections.map((s) => [s.sectionId, s]))
  const mySectionIds = [...new Set(assignments.data.map((a) => a.sectionId))]
  const fullName =
    (profile.data as { full_name: string } | null)?.full_name?.trim() ?? ""

  return ok({
    fullName,
    // The workspace's own timezone (`school_profiles.timezone`) is not
    // fetched for this: every target school is in Bangladesh (DATA-MODEL
    // §... default `Asia/Dhaka`), and the greeting period is a courtesy,
    // not a business rule the way `attendance_day`'s own school-day/date
    // math is.
    greetingPeriod: greetingPeriod(Number(clockTimeIn().slice(0, 2))),
    todayIso: day.data.today,
    todos: buildTodos(day.data.isSchoolDay, mySectionIds, sectionsById),
    classes: buildClassBlocks(
      day.data.isSchoolDay,
      assignments.data,
      day.data.sections
    ),
    showAllClasses: ctx.role === "owner" || ctx.role === "admin",
  })
}
