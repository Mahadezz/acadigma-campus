/**
 * The shipped defaults for `school_profiles`' five jsonb policy blobs
 * (DATA-MODEL.md §1.3, F-OP-07 §3, §5.1; DECISION-LOG D-23(5), D-29(3)).
 *
 * DATA-MODEL.md is the schema of record when it and the feature spec disagree
 * (CLAUDE.md "Where everything lives"). This is the *only* place these values are
 * written down — `resolve()` in this folder is the only function allowed to read a
 * school's raw jsonb and turn it into something a consumer can trust.
 *
 * `fourth_subject_bonus_threshold_gp` (the BD 4th-subject GPA bonus threshold) and
 * a Ramadan/Eid closure mode are deliberately absent: DATA-MODEL.md §2 and F-AC-01
 * place the former on `academic_years`, not on `school_profiles.academic_settings`,
 * and neither F-OP-07 nor F-AC-11's Part 1 scope defines closure-mode fields on this
 * table. Out of scope for this resolver; see docs/test-reports/2026-09-17-M0-gates.md.
 */

import { DEFAULT_TIMEZONE } from "../time"

/** ISO-8601 day numbers (1=Mon..7=Sun). Bangladesh default Sat-Thu. */
export const DEFAULT_WORKING_DAYS: readonly number[] = [6, 7, 1, 2, 3, 4]

export { DEFAULT_TIMEZONE }

export type AttendancePolicy = {
  /** daily = one register per day; period = one per timetable period (D-29(3)). */
  mode: "daily" | "period"
  /** "HH:MM" — after this wall-clock time a session counts as late by default. */
  cutoff: string
  late_counts_present: boolean
  half_day_counts_present: boolean
  /** Basis points: 7500 = 75 %. Crossing this is a warning, never a hard block. */
  min_attendance_bp: number
  block_exam_on_shortfall: boolean
}

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  mode: "daily",
  cutoff: "09:15",
  late_counts_present: true,
  half_day_counts_present: true,
  min_attendance_bp: 7500,
  block_exam_on_shortfall: false,
}

export type AcademicSettings = {
  grade_scale_code: string
  pass_mark_percent: number
  fail_any_subject_zero_gpa: boolean
  rank_by: string
  /** exam id -> weight; opaque map, DATA-MODEL.md §1.3. */
  exam_weights: Record<string, number>
}

export const DEFAULT_ACADEMIC_SETTINGS: AcademicSettings = {
  grade_scale_code: "BD_GPA5",
  pass_mark_percent: 33,
  fail_any_subject_zero_gpa: true,
  rank_by: "gpa_then_total",
  exam_weights: {},
}

export type CoverPolicy = {
  missed_punch_grace_minutes: number
  enable_missed_punch: boolean
  cover_credited: boolean
  unpaid_absence: boolean
}

export const DEFAULT_COVER_POLICY: CoverPolicy = {
  missed_punch_grace_minutes: 30,
  enable_missed_punch: false,
  cover_credited: true,
  unpaid_absence: false,
}

export type MessagingPolicy = {
  parents_can_reply: boolean
  announcement_roles: string[]
  /** opaque per-role/day schedule; no fixed shape yet, DATA-MODEL.md §1.3. */
  quiet_hours: Record<string, unknown>
}

export const DEFAULT_MESSAGING_POLICY: MessagingPolicy = {
  parents_can_reply: true,
  announcement_roles: ["owner", "admin"],
  quiet_hours: {},
}

export type Branding = {
  logo_file_id: string | null
  header_line_1: string | null
  header_line_2: string | null
  accent: string | null
  report_footer: string | null
}

export const DEFAULT_BRANDING: Branding = {
  logo_file_id: null,
  header_line_1: null,
  header_line_2: null,
  accent: null,
  report_footer: null,
}
