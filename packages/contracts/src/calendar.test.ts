import { describe, expect, it } from "vitest"

import {
  createHolidayInputSchema,
  upsertWorkingDayOverrideInputSchema,
} from "./calendar"

const valid = {
  name: "Eid-ul-Fitr",
  kind: "religious",
  startsOn: "2026-03-20",
  endsOn: "2026-03-22",
}

describe("createHolidayInputSchema", () => {
  it("accepts a 3-day holiday and a single day", () => {
    expect(createHolidayInputSchema.safeParse(valid).success).toBe(true)
    expect(
      createHolidayInputSchema.safeParse({ ...valid, endsOn: "2026-03-20" })
        .success
    ).toBe(true)
  })

  it("rejects a range that ends before it starts, naming endsOn", () => {
    const result = createHolidayInputSchema.safeParse({
      ...valid,
      endsOn: "2026-03-19",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["endsOn"])
  })

  it("rejects a range of a year or more (the database check)", () => {
    expect(
      createHolidayInputSchema.safeParse({
        ...valid,
        startsOn: "2026-01-01",
        endsOn: "2027-01-02",
      }).success
    ).toBe(false)
    expect(
      createHolidayInputSchema.safeParse({
        ...valid,
        startsOn: "2026-01-01",
        endsOn: "2027-01-01",
      }).success
    ).toBe(true)
  })

  it("rejects an impossible date, a blank name, an unknown kind and extra keys", () => {
    for (const input of [
      { ...valid, startsOn: "2026-02-31", endsOn: "2026-03-01" },
      { ...valid, name: "   " },
      { ...valid, kind: "fun" },
      { ...valid, workspaceId: "x" },
    ]) {
      expect(createHolidayInputSchema.safeParse(input).success).toBe(false)
    }
  })
})

describe("working-day override schemas", () => {
  it("requires a reason (AC13) and a real date", () => {
    const ok = { date: "2026-11-06", isWorking: true, reason: "Make-up" }
    expect(upsertWorkingDayOverrideInputSchema.safeParse(ok).success).toBe(true)
    expect(
      upsertWorkingDayOverrideInputSchema.safeParse({ ...ok, reason: "  " })
        .success
    ).toBe(false)
    expect(
      upsertWorkingDayOverrideInputSchema.safeParse({
        ...ok,
        date: "2026-02-31",
      }).success
    ).toBe(false)
  })

  it("rejects unknown keys (no client-supplied workspace)", () => {
    expect(
      upsertWorkingDayOverrideInputSchema.safeParse({
        date: "2026-11-06",
        isWorking: false,
        reason: "x",
        workspaceId: "w",
      }).success
    ).toBe(false)
  })
})
