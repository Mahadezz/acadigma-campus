import { roundHalfUp } from "../grading/round"

/**
 * F-AC-06 §5.12 — exam status transitions, the same rule as
 * `app.tg_exams_status_guard`: one step forward along the chain, or one of
 * the two admin reversals, which need a reason. No cycling, no skipping.
 */
export const EXAM_STATUSES = [
  "draft",
  "scheduled",
  "in_progress",
  "marks_entry",
  "marks_locked",
  "published",
  "archived",
] as const
export type ExamStatus = (typeof EXAM_STATUSES)[number]

const REVERSALS: ReadonlyArray<readonly [ExamStatus, ExamStatus]> = [
  ["published", "marks_locked"],
  ["marks_locked", "marks_entry"],
]

export type TransitionCheck =
  | { ok: true; reversal: boolean }
  | { ok: false; code: "INVALID_TRANSITION" | "REASON_REQUIRED" }

export function checkExamTransition(
  from: ExamStatus,
  to: ExamStatus,
  reason?: string | null
): TransitionCheck {
  if (EXAM_STATUSES.indexOf(to) === EXAM_STATUSES.indexOf(from) + 1) {
    return { ok: true, reversal: false }
  }
  if (REVERSALS.some(([f, t]) => f === from && t === to)) {
    return reason?.trim()
      ? { ok: true, reversal: true }
      : { ok: false, code: "REASON_REQUIRED" }
  }
  return { ok: false, code: "INVALID_TRANSITION" }
}

/** The single forward step from `status`, or null at the end of the chain. */
export function nextExamStatus(status: ExamStatus): ExamStatus | null {
  return EXAM_STATUSES[EXAM_STATUSES.indexOf(status) + 1] ?? null
}

/** The reversal available from `status` (§5.12), or null. */
export function reversalFrom(status: ExamStatus): ExamStatus | null {
  return REVERSALS.find(([f]) => f === status)?.[1] ?? null
}

/** §5.6: pass marks default to round-half-up(full x pass mark %), whole marks
 * — the same default `public.create_exam` writes. */
export function defaultPassMarks(fullMarks: number, passMarkPercent: number) {
  return roundHalfUp((fullMarks * passMarkPercent) / 100, 0)
}
