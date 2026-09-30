/**
 * F-OP-07 Part 3 §4 W4, §7 (no separate `previewAttendancePolicy` contract —
 * see the spec deviation logged in DECISION-LOG D-212): one real student's
 * recorded statuses from the most recent month that has attendance data, for
 * the settings screen's live policy-effect line. Reuses
 * `getAttendanceRegister` (F-OP-03 Part 6) rather than a second SQL path —
 * that RPC already resolves the roster/records/RLS correctly for a month.
 * Never a stored record is touched or rewritten (§5.8 rule 2): this is a
 * read of what already happened, recomputed under a *candidate* policy only
 * in the browser (see attendance-policy-form.tsx).
 */

import {
  apiError,
  err,
  ok,
  type ApiError,
  type AttendanceStatus,
  type Result,
} from "@acadigma/contracts"

import { getAttendanceRegister } from "./attendance-register"

import type { AcadigmaSupabaseClient } from "../client"
import type { WorkspaceContext } from "../workspace-context"

export type AttendancePolicySample = {
  studentName: string | null
  month: string | null
  statuses: AttendanceStatus[]
}

const EMPTY: AttendancePolicySample = {
  studentName: null,
  month: null,
  statuses: [],
}

const UNAVAILABLE: ApiError = apiError(
  "dependency_unavailable",
  "Could not reach the database. Please try again."
)

export async function getAttendancePolicySample(
  supabase: AcadigmaSupabaseClient,
  ctx: WorkspaceContext
): Promise<Result<AttendancePolicySample, ApiError>> {
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("section_id, date")
    .eq("workspace_id", ctx.workspaceId)
    .order("date", { ascending: false })
    .order("section_id", { ascending: true }) // deterministic tie-break — same sample every page load
    .limit(1)
    .maybeSingle()

  if (error) return err(UNAVAILABLE)
  if (!data) return ok(EMPTY) // "not enough data yet" (§6) — a brand-new school.

  const row = data as { section_id: string; date: string }
  const month = row.date.slice(0, 7)

  const register = await getAttendanceRegister(
    supabase,
    ctx,
    row.section_id,
    month
  )
  if (!register.ok) return ok(EMPTY)

  let best: (typeof register.data.students)[number] | null = null
  for (const student of register.data.students) {
    if (!best || student.recordedDays > best.recordedDays) best = student
  }
  if (!best || best.recordedDays === 0) return ok(EMPTY)

  const statuses = best.cells.filter(
    (cell): cell is AttendanceStatus => cell !== null
  )
  return ok({ studentName: best.studentNameEn, month, statuses })
}
