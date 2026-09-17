import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  basisPointsSchema,
  cursorPageSchema,
  displayIdSchema,
  emailSchema,
  idempotencyKeySchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  paginated,
  paisaSchema,
  phoneSchema,
  shortText,
  sortDirectionSchema,
  timeOfDaySchema,
  timezoneSchema,
  uuidSchema,
} from "./common"

describe("identifiers", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(
      uuidSchema.safeParse("3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70").success
    ).toBe(true)
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false)
  })

  it("accepts the printed sequential id format", () => {
    expect(displayIdSchema.safeParse("STU-2026-00001").success).toBe(true)
    expect(displayIdSchema.safeParse("stu-2026-00001").success).toBe(false)
    expect(displayIdSchema.safeParse("STU-2026-1").success).toBe(false)
  })

  it("requires an idempotency key long enough not to collide", () => {
    expect(idempotencyKeySchema.safeParse("a".repeat(16)).success).toBe(true)
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false)
    expect(idempotencyKeySchema.safeParse("a".repeat(129)).success).toBe(false)
  })
})

describe("pagination", () => {
  it("defaults the page size and coerces a query-string limit", () => {
    expect(cursorPageSchema.parse({})).toEqual({ limit: PAGE_SIZE_DEFAULT })
    expect(cursorPageSchema.parse({ limit: "10" }).limit).toBe(10)
  })

  it("refuses a page big enough to be a denial of service", () => {
    expect(
      cursorPageSchema.safeParse({ limit: PAGE_SIZE_MAX + 1 }).success
    ).toBe(false)
    expect(cursorPageSchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it("wraps any row schema in the list envelope", () => {
    const schema = paginated(z.object({ id: uuidSchema }))
    const value = {
      items: [{ id: "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70" }],
      nextCursor: null,
    }
    expect(schema.parse(value)).toEqual(value)
  })

  it("only allows the two sort directions", () => {
    expect(sortDirectionSchema.safeParse("asc").success).toBe(true)
    expect(sortDirectionSchema.safeParse("sideways").success).toBe(false)
  })
})

describe("money", () => {
  it("requires whole, non-negative paisa", () => {
    expect(paisaSchema.safeParse(1234).success).toBe(true)
    expect(paisaSchema.safeParse(12.34).success).toBe(false)
    expect(paisaSchema.safeParse(-1).success).toBe(false)
  })

  it("defaults the currency to BDT", () => {
    expect(moneySchema.parse({ amount: 1000 })).toEqual({
      amount: 1000,
      currency: "BDT",
    })
  })

  it("keeps basis points inside 0..10000", () => {
    expect(basisPointsSchema.safeParse(3000).success).toBe(true)
    expect(basisPointsSchema.safeParse(10_001).success).toBe(false)
  })
})

describe("dates and times", () => {
  it("accepts a calendar date and rejects a timestamp", () => {
    expect(isoDateSchema.safeParse("2026-09-17").success).toBe(true)
    expect(isoDateSchema.safeParse("2026-09-17T00:00:00Z").success).toBe(false)
  })

  it("requires an offset on an instant", () => {
    expect(isoDateTimeSchema.safeParse("2026-09-17T12:00:00Z").success).toBe(
      true
    )
    expect(isoDateTimeSchema.safeParse("2026-09-17 12:00:00").success).toBe(
      false
    )
  })

  it("accepts 24-hour wall-clock time", () => {
    expect(timeOfDaySchema.safeParse("08:30").success).toBe(true)
    expect(timeOfDaySchema.safeParse("24:00").success).toBe(false)
    expect(timeOfDaySchema.safeParse("8:30").success).toBe(false)
  })

  it("defaults the timezone to Asia/Dhaka", () => {
    expect(timezoneSchema.parse(undefined)).toBe("Asia/Dhaka")
  })
})

describe("contact details", () => {
  it("normalises an email", () => {
    expect(emailSchema.parse("  Head@School.EDU.BD ")).toBe(
      "head@school.edu.bd"
    )
    expect(emailSchema.safeParse("not-an-email").success).toBe(false)
  })

  it("accepts Bangladeshi mobile numbers in E.164", () => {
    expect(phoneSchema.safeParse("+8801712345678").success).toBe(true)
    expect(phoneSchema.safeParse("01712345678").success).toBe(false)
    expect(phoneSchema.safeParse("+8801212345678").success).toBe(false)
  })
})

describe("shortText", () => {
  it("trims and enforces a length cap", () => {
    expect(shortText().parse("  Class 6A  ")).toBe("Class 6A")
    expect(shortText(4).safeParse("too long").success).toBe(false)
    expect(shortText().safeParse("   ").success).toBe(false)
  })
})
