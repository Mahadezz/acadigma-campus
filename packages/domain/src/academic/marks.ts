/**
 * F-AC-06 Part 3 (D-304) — marks entry rules shared by the screen and the
 * tests. `public.save_marks` enforces the same range in the database.
 */

export type MarkInputCheck =
  | { ok: true; value: number | null }
  | { ok: false; issue: "NOT_A_NUMBER" | "MARK_OUT_OF_RANGE" }

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯"

/**
 * A typed mark: blank is "not entered yet"; otherwise a number from 0 to
 * `fullMarks` with at most 2 decimals. Bengali digits from a Bangla keypad
 * are read as Western ones (the UI shows Western digits, DESIGN-SYSTEM §1.6).
 */
export function parseMarkInput(raw: string, fullMarks: number): MarkInputCheck {
  const text = raw
    .trim()
    .replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)))
  if (text === "") return { ok: true, value: null }
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    return { ok: false, issue: "NOT_A_NUMBER" }
  const value = Number(text)
  if (value > fullMarks) return { ok: false, issue: "MARK_OUT_OF_RANGE" }
  return { ok: true, value }
}

/** "24 of 40 entered": a row counts once it has a number, absent or exempt. */
export function marksProgress(rows: ReadonlyArray<{ status: string | null }>): {
  done: number
  total: number
} {
  return {
    done: rows.filter((r) => r.status !== null).length,
    total: rows.length,
  }
}

/**
 * F-AC-06 §5.11 (D-307) — a paper's effective marks entry window, the same
 * rule as `app.marks_entry_window`: opens on the date set, else the exam
 * date; closes on the date set, else 7 days after the later of its
 * opening and the exam's last day (D-307 review: a BD exam runs about two
 * weeks). Dates are ISO `YYYY-MM-DD`; null means that side has no limit.
 */
export function marksEntryWindow(paper: {
  examDate: string | null
  entryOpensOn: string | null
  entryClosesOn: string | null
  examEndsOn: string | null
}): { opensOn: string | null; closesOn: string | null } {
  const opensOn = paper.entryOpensOn ?? paper.examDate
  // ISO dates compare as strings; like SQL greatest(), a null is skipped.
  const from = [opensOn, paper.examEndsOn]
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1)
  return {
    opensOn,
    closesOn: paper.entryClosesOn ?? (from ? addDays(from, 7) : null),
  }
}

/** Is `today` (ISO date, the school's calendar day) outside the window? */
export function outsideEntryWindow(
  window: { opensOn: string | null; closesOn: string | null },
  today: string
): boolean {
  return (
    (window.opensOn !== null && today < window.opensOn) ||
    (window.closesOn !== null && today > window.closesOn)
  )
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
