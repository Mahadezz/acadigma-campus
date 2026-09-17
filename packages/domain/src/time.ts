/**
 * Workspace-local time (ARCHITECTURE §4).
 *
 * "Today" is never the server's today. A teacher opening attendance at 00:30 in
 * Dhaka is on a different calendar day from a Vercel function running in UTC, and
 * marking the wrong day is the kind of bug that quietly corrupts a term's records.
 * Everything here goes through the workspace timezone (`school_profiles.timezone`,
 * default `Asia/Dhaka`).
 *
 * Calendar dates are plain `YYYY-MM-DD` strings: that is what Postgres `date`
 * columns hold, they compare correctly with `<`, and they carry no phantom offset.
 */

export const DEFAULT_TIMEZONE = "Asia/Dhaka"

/** A calendar date with no time and no zone, e.g. "2026-09-17". */
export type IsoDate = string

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MILLIS_PER_DAY = 86_400_000

export class TimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TimeError"
  }
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  // Rejects 2026-02-31, which matches the pattern but is not a real day.
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(timestamp) && toIsoDateUtc(new Date(timestamp)) === value
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) {
    throw new TimeError(
      `"${value}" is not a calendar date (expected YYYY-MM-DD)`
    )
  }
}

function toIsoDateUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

/**
 * The calendar date at `instant` as seen in `timeZone`.
 * `en-CA` is used because its short date format is already `YYYY-MM-DD`.
 */
export function todayIn(
  timeZone: string = DEFAULT_TIMEZONE,
  instant: Date = new Date()
): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}

/** Wall-clock time at `instant` in `timeZone`, as "HH:MM". */
export function clockTimeIn(
  timeZone: string = DEFAULT_TIMEZONE,
  instant: Date = new Date()
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant)
}

/** True when `instant` falls on the workspace's current day. */
export function isToday(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): boolean {
  return todayIn(timeZone, instant) === todayIn(timeZone, now)
}

/** Moves a calendar date by whole days. Negative counts go backwards. */
export function addDays(date: IsoDate, days: number): IsoDate {
  assertIsoDate(date)
  if (!Number.isInteger(days)) {
    throw new TimeError(`Day offset must be an integer, got ${days}`)
  }
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return toIsoDateUtc(shifted)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  assertIsoDate(from)
  assertIsoDate(to)
  const millis = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(millis / MILLIS_PER_DAY)
}

/** -1, 0 or 1 - usable directly as an Array#sort comparator. */
export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  assertIsoDate(a)
  assertIsoDate(b)
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * The UTC instant at which a calendar date begins in `timeZone`. Needed whenever a
 * `date` column has to be compared against a `timestamptz` one: attendance for
 * 2026-09-17 in Dhaka starts at 2026-09-16T18:00:00Z.
 */
export function startOfDayUtc(
  date: IsoDate,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  assertIsoDate(date)
  const naiveUtc = Date.parse(`${date}T00:00:00Z`)
  // Find the offset by asking what that instant looks like in the zone, then
  // correct by the difference. One pass is enough for the fixed and half-hour
  // offsets this product runs in; Asia/Dhaka has no DST.
  const offsetMillis = zoneOffsetMillis(new Date(naiveUtc), timeZone)
  return new Date(naiveUtc - offsetMillis)
}

/** Exclusive end of a calendar day: the start of the next day. */
export function endOfDayUtc(
  date: IsoDate,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  return startOfDayUtc(addDays(date, 1), timeZone)
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
export function zoneOffsetMillis(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant)

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0")

  // Some ICU versions report midnight as hour 24.
  const hour = read("hour") % 24
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second")
  )
  return asUtc - instant.getTime()
}

/** Renders a calendar date the way a Bangladeshi school reads it: "17 Sep 2026". */
export function formatIsoDate(
  date: IsoDate,
  locale = "en-GB",
  timeZone: string = DEFAULT_TIMEZONE
): string {
  assertIsoDate(date)
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(startOfDayUtc(date, timeZone))
}
