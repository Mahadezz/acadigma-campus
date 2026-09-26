/**
 * F-ID-10 Part 2 (§4.4, §7 `getBasicHome`) — the basic-mode home screen.
 * Every read goes through an already-shipped repository or RLS-protected
 * table: `listMySections` (F-AC-01 Part 5, D-107) for the assignment list,
 * `attendance_day` (F-AC-03) for today's per-section enrolled count and
 * session, and the caller's own `profiles` row for their name.
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
} from "@acadigma/domain/basic-home"
import { clockTimeIn } from "@acadigma/domain/time"

import { listMySections } from "./academics"
import { getAttendanceDay } from "./attendance"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

/**
 * §7: `{fullName, greetingPeriod, todayIso, todos, classes, showAllClasses}`
 * — see `packages/contracts/src/identity/basic-home.ts`'s docblock for why
 * this returns raw facts rather than the spec table's single pre-rendered
 * `greeting` string. One round trip each for the caller's own assignments
 * (`listMySections`), the Today attendance overview, and the caller's name
 * — no query runs once per class.
 *
 * D-405: this used to build the assignment list itself, from
 * `attendance_day`'s `is_mine` plus a direct `exam_subjects.teacher_id`
 * query — the interim source F-ID-10 §2 footnote ² named before
 * `section_subjects` existed. F-AC-01 Part 5 (D-107) shipped
 * `listMySections`, built and named specifically for this loader, so this
 * now calls that instead.
 */
export async function getBasicHome(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<BasicHome, ApiError>> {
  const [mySections, day, profile] = await Promise.all([
    listMySections(supabase, ctx),
    getAttendanceDay(supabase, ctx),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle(),
  ])
  if (!mySections.ok) return mySections
  if (!day.ok) return day
  if (profile.error) return err(UNAVAILABLE)

  const sectionsById = new Map(day.data.sections.map((s) => [s.sectionId, s]))
  const mySectionIds = mySections.data.map((s) => s.sectionId)
  const fullName =
    (profile.data as { full_name: string } | null)?.full_name?.trim() ?? ""

  return ok({
    fullName,
    // The workspace's own timezone (`school_profiles.timezone`) is not
    // fetched for this: every target school is in Bangladesh (DATA-MODEL
    // default `Asia/Dhaka`), and the greeting period is a courtesy, not a
    // business rule the way `attendance_day`'s own school-day/date math is.
    greetingPeriod: greetingPeriod(Number(clockTimeIn().slice(0, 2))),
    todayIso: day.data.today,
    todos: buildTodos(day.data.isSchoolDay, mySectionIds, sectionsById),
    classes: buildClassBlocks(
      day.data.isSchoolDay,
      mySections.data,
      day.data.sections
    ),
    showAllClasses: ctx.role === "owner" || ctx.role === "admin",
  })
}
