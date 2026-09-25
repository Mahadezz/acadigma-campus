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

/**
 * `currentReason` is the exam's stored `status_reason`: the database refuses
 * a reversal whose reason is missing or unchanged from it (a reversal must
 * carry its own reason), and so does this.
 */
export function checkExamTransition(
  from: ExamStatus,
  to: ExamStatus,
  reason?: string | null,
  currentReason?: string | null
): TransitionCheck {
  if (EXAM_STATUSES.indexOf(to) === EXAM_STATUSES.indexOf(from) + 1) {
    return { ok: true, reversal: false }
  }
  if (REVERSALS.some(([f, t]) => f === from && t === to)) {
    const given = reason?.trim()
    return given && given !== currentReason?.trim()
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

/** §5.6: pass marks default to full x pass mark %, NOT rounded to whole marks
 * (D-302) — kept at the 2 decimals numeric(6,2) stores, the same default
 * `public.create_exam` writes (33 % of 50 = 16.50). */
export function defaultPassMarks(fullMarks: number, passMarkPercent: number) {
  return roundHalfUp((fullMarks * passMarkPercent) / 100, 2)
}

/** From `marks_entry` on, papers' marks and membership are locked (the
 * database's app.tg_exam_papers_lock). */
export function papersLocked(status: ExamStatus): boolean {
  return EXAM_STATUSES.indexOf(status) >= EXAM_STATUSES.indexOf("marks_entry")
}
