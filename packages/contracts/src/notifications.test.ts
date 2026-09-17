import { describe, expect, it } from "vitest"

import {
  notificationCategorySchema,
  notificationChannelSchema,
  notificationEventIdSchema,
  notificationPrioritySchema,
  notifyInputSchema,
} from "./notifications"

describe("notificationEventIdSchema", () => {
  it("accepts a real catalogue event", () => {
    expect(notificationEventIdSchema.safeParse("attendance.low").success).toBe(
      true
    )
  })

  it("rejects an event not in the catalogue", () => {
    expect(
      notificationEventIdSchema.safeParse("attendance.fabricated").success
    ).toBe(false)
  })

  it("has no duplicate values", () => {
    const values = notificationEventIdSchema.options
    expect(new Set(values).size).toBe(values.length)
  })
})

describe("notificationCategorySchema / prioritySchema / channelSchema", () => {
  it("accepts every documented category", () => {
    for (const category of [
      "security",
      "people",
      "academics",
      "billing",
      "marketplace",
      "messages",
      "system",
    ]) {
      expect(notificationCategorySchema.safeParse(category).success).toBe(true)
    }
  })

  it("rejects a category that is not derived from the catalogue", () => {
    expect(notificationCategorySchema.safeParse("misc").success).toBe(false)
  })

  it("accepts the three priorities and rejects a fourth", () => {
    expect(notificationPrioritySchema.safeParse("low").success).toBe(true)
    expect(notificationPrioritySchema.safeParse("normal").success).toBe(true)
    expect(notificationPrioritySchema.safeParse("high").success).toBe(true)
    expect(notificationPrioritySchema.safeParse("urgent").success).toBe(false)
  })

  it("accepts the three channels", () => {
    expect(notificationChannelSchema.safeParse("in_app").success).toBe(true)
    expect(notificationChannelSchema.safeParse("push").success).toBe(true)
    expect(notificationChannelSchema.safeParse("email").success).toBe(true)
    expect(notificationChannelSchema.safeParse("sms").success).toBe(false)
  })
})

describe("notifyInputSchema", () => {
  const recipientId = "11111111-1111-1111-1111-111111111111"

  it("accepts a minimal valid call", () => {
    const result = notifyInputSchema.safeParse({
      event: "attendance.low",
      recipientIds: [recipientId],
      actionUrl: "/app/attendance/alerts?section=abc",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data).toEqual({})
    }
  })

  it("rejects an unknown event", () => {
    const result = notifyInputSchema.safeParse({
      event: "made.up",
      recipientIds: [recipientId],
    })
    expect(result.success).toBe(false)
  })

  it("rejects zero recipients", () => {
    const result = notifyInputSchema.safeParse({
      event: "attendance.low",
      recipientIds: [],
    })
    expect(result.success).toBe(false)
  })

  // version=4, variant=8 nibbles fixed so every generated id is a syntactically
  // valid uuid under Zod's strict RFC 4122 check; only the trailing run varies.
  const fakeUuid = (i: number) =>
    `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`

  it("rejects more than 2000 recipients (the fan-out cap, §5.2)", () => {
    const recipientIds = Array.from({ length: 2001 }, (_, i) => fakeUuid(i))
    const result = notifyInputSchema.safeParse({
      event: "attendance.low",
      recipientIds,
    })
    expect(result.success).toBe(false)
  })

  it("accepts exactly 2000 recipients", () => {
    const recipientIds = Array.from({ length: 2000 }, (_, i) => fakeUuid(i))
    const result = notifyInputSchema.safeParse({
      event: "attendance.low",
      recipientIds,
    })
    expect(result.success).toBe(true)
  })

  it("accepts a null workspaceId for an account-level event", () => {
    const result = notifyInputSchema.safeParse({
      event: "auth.new_device_signin",
      recipientIds: [recipientId],
      workspaceId: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a malformed workspaceId", () => {
    const result = notifyInputSchema.safeParse({
      event: "attendance.low",
      recipientIds: [recipientId],
      workspaceId: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("carries arbitrary data used to render the title/body later", () => {
    const result = notifyInputSchema.safeParse({
      event: "marks.published",
      recipientIds: [recipientId],
      data: { studentName: "Ayesha", section: "6A" },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data).toEqual({ studentName: "Ayesha", section: "6A" })
    }
  })
})
