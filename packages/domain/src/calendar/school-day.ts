/**
 * F-OP-03 Part 6 (D-208) — a pure, TypeScript mirror of
 * `app.is_school_day`'s precedence (F-AC-11 §5.1, 20260925300301_school_calendar.sql):
 * an override for the date wins, then the weekly pattern
 * (`school_profiles.working_days`, ISO 1=Mon..7=Sun), then a holiday, else
 * true. Used by the attendance register (`getAttendanceRegister`,
 * `@acadigma/db`) to build a whole month's calendar in one round trip
 * (`holidays` + `working_day_overrides` are both directly SELECT-able by an
 * active owner/admin/teacher/staff member, per that migration's own RLS —
 * no new `app.*` wrapper needed for a date *range*, only `app.is_school_day`
 * itself is SECURITY DEFINER, for the parent case D-203 carves out).
 */

export type HolidayRange = { startsOn: string; endsOn: string }

/** ISO day-of-week for a `YYYY-MM-DD` string: 1=Monday .. 7=Sunday. */
export function isoDayOfWeek(dateIso: string): number {
  const jsDay = new Date(`${dateIso}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay
}

export function isSchoolDay(
  dateIso: string,
  workingDays: readonly number[],
  holidays: readonly HolidayRange[],
  /** `date -> is_working`, from `working_day_overrides`. */
  overrides: ReadonlyMap<string, boolean>
): boolean {
  const override = overrides.get(dateIso)
  if (override !== undefined) return override
  if (!workingDays.includes(isoDayOfWeek(dateIso))) return false
  return !holidays.some((h) => h.startsOn <= dateIso && dateIso <= h.endsOn)
}

/** Every `YYYY-MM-DD` date in `year`-`month` (1-12), in order. */
export function daysInMonth(year: number, month: number): string[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => {
    const day = String(i + 1).padStart(2, "0")
    const mm = String(month).padStart(2, "0")
    return `${year}-${mm}-${day}`
  })
}
