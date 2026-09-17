import { z } from "zod"

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Every primary key in the schema is a uuid (ARCHITECTURE §4). */
export const uuidSchema = z.string().uuid()
export type Uuid = z.infer<typeof uuidSchema>

export const workspaceIdSchema = uuidSchema.describe("workspaces.id")
export const userIdSchema = uuidSchema.describe("auth.users.id")

/**
 * Human-facing sequential ids minted by `app.next_id()`: `STU-2026-00001`.
 * Prefix is 2–4 upper-case letters, then a four-digit year, then a five-digit run.
 */
export const displayIdSchema = z
  .string()
  .regex(/^[A-Z]{2,4}-\d{4}-\d{5}$/, "Expected a code such as STU-2026-00001")

/**
 * Deduplicates retried mutations (ARCHITECTURE §5). The client generates it once
 * per user intent and resends the same value on every retry.
 */
export const idempotencyKeySchema = z.string().min(16).max(128)

// ---------------------------------------------------------------------------
// Pagination — cursor-based, because offsets drift while a tenant is writing.
// ---------------------------------------------------------------------------

export const PAGE_SIZE_DEFAULT = 25
export const PAGE_SIZE_MAX = 100

export const cursorPageSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE_MAX)
    .default(PAGE_SIZE_DEFAULT),
})
export type CursorPage = z.infer<typeof cursorPageSchema>

/** Wraps any row schema in the envelope every list endpoint returns. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })
}

export type Paginated<T> = { items: T[]; nextCursor: string | null }

export const sortDirectionSchema = z.enum(["asc", "desc"])
export type SortDirection = z.infer<typeof sortDirectionSchema>

// ---------------------------------------------------------------------------
// Money — integer paisa, never floats (ARCHITECTURE §4, DECISION-LOG D-09).
// ---------------------------------------------------------------------------

export const currencySchema = z.enum(["BDT"])
export type Currency = z.infer<typeof currencySchema>

/** Amounts are whole paisa. 100 paisa = ৳1. Capped below Number.MAX_SAFE_INTEGER. */
export const paisaSchema = z
  .number()
  .int("Amounts are whole paisa")
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const moneySchema = z.object({
  amount: paisaSchema,
  currency: currencySchema.default("BDT"),
})
export type Money = z.infer<typeof moneySchema>

/** Percentages are basis points: 3000 bp = 30 % (the platform commission, D-15). */
export const basisPointsSchema = z.number().int().min(0).max(10_000)

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

/** A calendar date with no timezone: attendance dates, exam dates. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
export type IsoDate = z.infer<typeof isoDateSchema>

/** An instant. Stored as `timestamptz`, carried as an ISO 8601 string. */
export const isoDateTimeSchema = z.string().datetime({ offset: true })
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>

/** Wall-clock time inside a school day, e.g. a timetable period start. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM in 24-hour time")

/** IANA zone name; schools default to Asia/Dhaka (ARCHITECTURE §4). */
export const timezoneSchema = z.string().min(1).default("Asia/Dhaka")

// ---------------------------------------------------------------------------
// Contact details, Bangladesh-first
// ---------------------------------------------------------------------------

// Order matters: Zod applies string transforms in chain order, so trimming and
// lower-casing must come *before* the format check — otherwise a pasted address with
// a trailing space is rejected as malformed.
export const emailSchema = z.string().trim().toLowerCase().email().max(255)

/** Bangladeshi mobile numbers in E.164: +8801XXXXXXXXX. */
export const phoneSchema = z
  .string()
  .regex(
    /^\+8801[3-9]\d{8}$/,
    "Expected a Bangladeshi mobile number, e.g. +8801712345678"
  )

/** Free-text the user typed. Trimmed and length-capped before it reaches the DB. */
export function shortText(max = 255) {
  return z.string().trim().min(1).max(max)
}
