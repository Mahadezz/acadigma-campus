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
