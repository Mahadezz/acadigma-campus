import { describe, expect, it } from "vitest"

import {
  notificationCategorySchema,
  notificationChannelSchema,
  notificationPrioritySchema,
} from "@acadigma/contracts"

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PRIORITIES,
} from "./catalog"

// The domain catalogue and the wire contracts describe the same enums. If one
// side gains a value the other must too, or a valid event fails validation at
// the boundary (review of PR #4).
describe("notification enums stay in parity with @acadigma/contracts", () => {
  it("categories", () => {
    expect([...NOTIFICATION_CATEGORIES].sort()).toEqual(
      [...notificationCategorySchema.options].sort()
    )
  })
  it("priorities", () => {
    expect([...NOTIFICATION_PRIORITIES].sort()).toEqual(
      [...notificationPrioritySchema.options].sort()
    )
  })
  it("channels", () => {
    expect([...NOTIFICATION_CHANNELS].sort()).toEqual(
      [...notificationChannelSchema.options].sort()
    )
  })
})
