/**
 * F-ID-10 Part 3 (§4.5, §7 `getClassHub`) — the class hub: gate ("is this
 * my class?"), section header facts, and the two tabs' own small reads
 * (Marks: this section's papers I teach; Print: the latest exam whose
 * results are computed or published). Attendance and Students reuse
 * `getAttendanceDay`/`getRollCall` and `listRoster` unchanged (§7: "every
 * tab reuses its feature's existing actions").
 */

import {
  apiError,
  err,
  examSubjectStatusSchema,
  ok,
  type ApiError,
  type ClassHub,
  type Result,
  type SectionPaper,
  type SectionPrintExam,
} from "@acadigma/contracts"
import { CLASS_HUB_TABS } from "@acadigma/domain/class-hub"

import { listMySections } from "./academics"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/** §7 error `SECTION_NOT_FOUND`. */
const SECTION_NOT_FOUND: ApiError = apiError(
  "not_found",
  "That class does not exist."
)

/**
 * §7 error `NOT_ASSIGNED` (§2 footnote ² / §9 AC11). `ApiErrorCode` has no
 * dedicated code for this, so it rides `forbidden` — the same shape
 * `exams.ts`'s `MARKS_INCOMPLETE`/`REASON_REQUIRED` already use to let a
 * caller branch on the specific reason via `fieldErrors._root`.
 */
const NOT_ASSIGNED: ApiError = apiError(
  "forbidden",
  "This class is not on your list.",
  { fieldErrors: { _root: ["NOT_ASSIGNED"] } }
)

/** True when `error` is the `NOT_ASSIGNED` sentinel above. */
export function isNotAssignedError(error: ApiError): boolean {
  return error.fieldErrors?._root?.[0] === "NOT_ASSIGNED"
}

type SectionRow = {
  id: string
  name: string
  grade_levels: { name: string; name_bn: string } | null
}

/**
 * §7 `getClassHub`. Owner/admin may open any live section (§4.4 footnote
 * ¹'s "All classes"); everyone else must be in their own `listMySections`
 * (class teacher or subject teacher, D-107) or gets `NOT_ASSIGNED` — a
 * stricter, hub-level gate on top of each tab's own unchanged permission
 * check (§2 footnote ³).
 */
export async function getClassHub(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string
): Promise<Result<ClassHub, ApiError>> {
  const isManager = ctx.role === "owner" || ctx.role === "admin"

  const [section, countResult, mySections] = await Promise.all([
    supabase
      .from("sections")
      .select("id, name, grade_levels!sections_grade_level_fkey(name, name_bn)")
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", sectionId)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("student_roster")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("section_id", sectionId)
      .is("deleted_at", null),
    isManager ? null : listMySections(supabase, ctx),
  ])

  if (section.error || countResult.error) return err(UNAVAILABLE)
  if (!section.data) return err(SECTION_NOT_FOUND)

  if (!isManager) {
    if (!mySections || !mySections.ok) return mySections ?? err(UNAVAILABLE)
    const mine = mySections.data.some((s) => s.sectionId === sectionId)
    if (!mine) return err(NOT_ASSIGNED)
  }

  const row = section.data as unknown as SectionRow
  return ok({
    section: {
      id: row.id,
      name: row.name,
      gradeName: row.grade_levels?.name ?? "",
      gradeNameBn: row.grade_levels?.name_bn ?? "",
    },
    studentCount: countResult.count ?? 0,
    tabs: [...CLASS_HUB_TABS],
  })
}

type SectionPaperRow = {
  id: string
  status: string
  exam_id: string
  exams: { name: string } | null
  subjects: { name: string; name_bn: string | null } | null
}

const PAPER_COLUMNS =
  "id, status, exam_id, exams(name), subjects(name, name_bn)"

/**
 * Marks tab (§8 Part 3): this section's papers the caller teaches. Same
 * "teaches" definition `getMarkSheet` (`marks.ts`) already uses — the
 * paper's own subject teacher (`exam_subjects.teacher_id`) or the section's
 * class teacher — both are `workspace_members.id`, not `ctx.userId`, so the
 * caller's member row is resolved first. RLS already lets any workspace
 * member read every paper; this narrowing is this function's own job.
 */
export async function listSectionPapers(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string
): Promise<Result<SectionPaper[], ApiError>> {
  const member = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle()
  if (member.error) return err(UNAVAILABLE)
  const memberId = member.data?.id ?? null
  if (!memberId) return ok([])

  // Ponytail cut (review): filtered in the query — the same two-query,
  // "class teacher OR subject teacher" shape `listMySections` (academics.ts)
  // already uses for this identical choice, instead of fetching every paper
  // of the section and filtering in JS. A caller who is both (the class
  // teacher also teaching a subject here) can match both queries; `byId`
  // below dedupes on `exam_subjects.id`.
  const [bySubject, byClassTeacher] = await Promise.all([
    supabase
      .from("exam_subjects")
      .select(PAPER_COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .eq("section_id", sectionId)
      .eq("teacher_id", memberId),
    supabase
      .from("exam_subjects")
      .select(`${PAPER_COLUMNS}, sections!inner(class_teacher_id)`)
      .eq("workspace_id", ctx.workspaceId)
      .eq("section_id", sectionId)
      .eq("sections.class_teacher_id", memberId),
  ])
  if (bySubject.error || byClassTeacher.error) return err(UNAVAILABLE)
  const byId = new Map<string, SectionPaperRow>()
  for (const r of [
    ...((bySubject.data ?? []) as unknown as SectionPaperRow[]),
    ...((byClassTeacher.data ?? []) as unknown as SectionPaperRow[]),
  ]) {
    byId.set(r.id, r)
  }
  const rows = [...byId.values()]
  if (rows.length === 0) return ok([])

  // `exam_marks_progress` (already shipped, F-AC-06 Part 2) counts a whole
  // exam's papers at once — reused per unique exam id rather than adding a
  // new per-paper RPC for what is, per teacher, almost always one exam.
  const examIds = [...new Set(rows.map((r) => r.exam_id))]
  const progressResults = await Promise.all(
    examIds.map((examId) =>
      supabase.rpc("exam_marks_progress", {
        p_workspace_id: ctx.workspaceId,
        p_exam_id: examId,
      })
    )
  )
  if (progressResults.some((r) => r.error)) return err(UNAVAILABLE)
  const progressById: Record<string, { enrolled: number; marked: number }> =
    Object.assign({}, ...progressResults.map((r) => r.data ?? {}))

  return ok(
    rows
      .filter((r) => examSubjectStatusSchema.safeParse(r.status).success)
      .map((r) => ({
        examSubjectId: r.id,
        examId: r.exam_id,
        examName: r.exams?.name ?? "",
        subjectName: r.subjects?.name ?? "",
        subjectNameBn: r.subjects?.name_bn ?? null,
        status: r.status as SectionPaper["status"],
        marksDone: progressById[r.id]?.marked ?? 0,
        enrolled: progressById[r.id]?.enrolled ?? 0,
      }))
  )
}

type SectionExamRow = {
  id: string
  name: string
  status: string
}

/**
 * Print tab (§8 Part 3): "the latest published or computed exam" for this
 * section. `exams.status` of `marks_locked` (results computed, not yet
 * published) or `published` — the two statuses `/app/exams/[id]/results`
 * (D-207) already renders from. `null` means neither exists yet.
 *
 * Ponytail cut (review): queried from `exams` directly (`workspace_id` is
 * its own column — `exams_id_workspace_key`), filtered through the
 * `exam_subjects!inner` embed instead of reduced in JS. "published" sorts
 * after "marks_locked" alphabetically, so a plain descending `status` order
 * already ranks it first; the most recently started exam wins within a
 * status. `exam_subjects!inner` can duplicate the winning exam's row (one
 * exam can have several subjects in this section), but every duplicate
 * carries the same `status`/`starts_on` (properties of the exam, not the
 * subject), so the first row after this order and `limit(1)` is already
 * the answer regardless of which duplicate the database picks.
 */
export async function getLatestSectionExam(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext,
  sectionId: string
): Promise<Result<SectionPrintExam | null, ApiError>> {
  const { data, error } = await supabase
    .from("exams")
    .select("id, name, status, exam_subjects!inner(section_id)")
    .eq("workspace_id", ctx.workspaceId)
    .eq("exam_subjects.section_id", sectionId)
    .in("status", ["marks_locked", "published"])
    .order("status", { ascending: false })
    .order("starts_on", { ascending: false, nullsFirst: false })
    .limit(1)
  if (error) return err(UNAVAILABLE)
  const row = ((data ?? []) as unknown as SectionExamRow[])[0]
  if (!row) return ok(null)
  return ok({
    examId: row.id,
    examName: row.name,
    status: row.status as SectionPrintExam["status"],
  })
}
