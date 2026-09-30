/**
 * F-AC-04 Part 1 (D-214): which face the check-in card shows. The status
 * rule itself (present / late, minutes late) lives in SQL
 * (`app.staff_check_in_status`) — the server is the only clock.
 */
export type CheckInCardState =
  | "no_school" // not a school day: no check-in is offered (D-214 point 2)
  | "can_check_in"
  | "checked_in" // in, not yet out
  | "checked_out"

export function checkInCardState(input: {
  isSchoolDay: boolean
  record: { checkInAt: string | null; checkOutAt: string | null } | null
}): CheckInCardState {
  const { record } = input
  // A row that exists wins over a calendar edit made after check-in.
  if (record?.checkInAt) return record.checkOutAt ? "checked_out" : "checked_in"
  return input.isSchoolDay ? "can_check_in" : "no_school"
}
