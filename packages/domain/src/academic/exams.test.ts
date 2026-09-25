import { describe, expect, it } from "vitest"

import {
  EXAM_STATUSES,
  checkExamTransition,
  defaultPassMarks,
  nextExamStatus,
  papersLocked,
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
    // Same rule as the database: a reversal cannot reuse the stored reason.
    expect(
      checkExamTransition(
        "marks_locked",
        "marks_entry",
        "Wrong marks",
        "Wrong marks"
      )
    ).toEqual({ ok: false, code: "REASON_REQUIRED" })
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

describe("papersLocked", () => {
  it("locks from marks_entry on", () => {
    expect(papersLocked("in_progress")).toBe(false)
    expect(papersLocked("marks_entry")).toBe(true)
    expect(papersLocked("archived")).toBe(true)
  })
})

describe("defaultPassMarks (§5.6)", () => {
  it("is full x pass mark %, not rounded to whole marks (D-302)", () => {
    expect(defaultPassMarks(100, 33)).toBe(33)
    expect(defaultPassMarks(50, 33)).toBe(16.5) // not rounded to 17
    expect(defaultPassMarks(75, 33)).toBe(24.75)
  })
})
