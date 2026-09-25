import { z } from "zod"

import { isoDateSchema, uuidSchema } from "./common"

/**
 * F-AC-11 Part 1 (D-202): holidays. Mirrors `public.holiday_kind` and the
 * `holidays` checks in `20260925300301_school_calendar.sql`.
 */
export const holidayKindSchema = z.enum([
  "public",
  "religious",
  "national",
  "school",
  "vacation",
  "weather",
  "emergency",
])
export type HolidayKind = z.infer<typeof holidayKindSchema>

export const holidaySourceSchema = z.enum(["seed", "manual", "import"])

/** Longest holiday the database accepts: `ends_on - starts_on < 366`. */
export const HOLIDAY_MAX_DAYS = 366

function dayNumber(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000
}

/** YYYY-MM-DD that is a real calendar date (no 31 February). */
const calendarDateSchema = isoDateSchema.refine((d) => {
  const t = Date.parse(`${d}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
}, "Not a real date")

export const createHolidayInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    nameBn: z.string().trim().min(1).max(120).nullable().optional(),
    kind: holidayKindSchema,
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema,
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((v) => v.endsOn >= v.startsOn, {
    path: ["endsOn"],
    message: "The last day must be on or after the first day.",
  })
  .refine(
    (v) => dayNumber(v.endsOn) - dayNumber(v.startsOn) < HOLIDAY_MAX_DAYS,
    {
      path: ["endsOn"],
      message: "A holiday can be at most one year long.",
    }
  )
export type CreateHolidayInput = z.infer<typeof createHolidayInputSchema>

export const deleteHolidayInputSchema = z
  .object({ holidayId: uuidSchema })
  .strict()
export type DeleteHolidayInput = z.infer<typeof deleteHolidayInputSchema>

export type Holiday = {
  id: string
  name: string
  nameBn: string | null
  kind: HolidayKind
  source: z.infer<typeof holidaySourceSchema>
  startsOn: string
  endsOn: string
  note: string | null
}
