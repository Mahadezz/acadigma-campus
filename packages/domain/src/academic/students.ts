/**
 * F-AC-02 §5 rule 3 — pure helpers for the student screens. No I/O.
 */

/** Completed years and months between an ISO date of birth and `on`
 * (both `YYYY-MM-DD`), e.g. `{ years: 10, months: 4 }`. */
export function ageOn(
  dateOfBirth: string,
  on: string
): { years: number; months: number } {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  const [oy, om, od] = on.split("-").map(Number) as [number, number, number]
  let months = (oy - by) * 12 + (om - bm)
  if (od < bd) months -= 1
  months = Math.max(0, months)
  return { years: Math.floor(months / 12), months: months % 12 }
}
