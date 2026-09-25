import { describe, expect, it } from "vitest"

import {
  EXAM_STATUSES,
  checkExamTransition,
  defaultPassMarks,
  nextExamStatus,
  reversalFrom,
} from "./exams"

describe("checkExamTransition (§5.12)", () => {
  it("allows exactly one step forward from every status", () => {
    for (let i = 0; i < EXAM_STATUSES.length; i++) {
      for (let j = 0; j < EXAM_STATUSES.length; j++) {
        const from = EXAM_STATUSES[i]!
        const to = EXAM_STATUSES[j]!
        const result = checkExamTransition(from, to, "a reason")
        const reversal =
          (from === "published" && to === "marks_locked") ||
          (from === "marks_locked" && to === "marks_entry")
        expect(result.ok, `${from} -> ${to}`).toBe(j === i + 1 || reversal)
      }
    }
  })

  it("never wraps from archived back to draft", () => {
    expect(checkExamTransition("archived", "draft")).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    })
  })

  it("requires a non-blank reason for the two reversals", () => {
    expect(checkExamTransition("marks_locked", "marks_entry")).toEqual({
      ok: false,
      code: "REASON_REQUIRED",
    })
    expect(checkExamTransition("published", "marks_locked", "  ")).toEqual({
      ok: false,
      code: "REASON_REQUIRED",
    })
    expect(
      checkExamTransition("published", "marks_locked", "Wrong marks")
    ).toEqual({ ok: true, reversal: true })
  })
})

describe("nextExamStatus / reversalFrom", () => {
  it("walks the chain and ends at archived", () => {
    expect(nextExamStatus("draft")).toBe("scheduled")
    expect(nextExamStatus("archived")).toBeNull()
    expect(reversalFrom("marks_locked")).toBe("marks_entry")
    expect(reversalFrom("draft")).toBeNull()
  })
})

describe("defaultPassMarks (§5.6)", () => {
  it("is 33 of 100 at 33 %, rounded half up", () => {
    expect(defaultPassMarks(100, 33)).toBe(33)
    expect(defaultPassMarks(50, 33)).toBe(17) // 16.5 -> 17
    expect(defaultPassMarks(75, 33)).toBe(25) // 24.75 -> 25
  })
})
