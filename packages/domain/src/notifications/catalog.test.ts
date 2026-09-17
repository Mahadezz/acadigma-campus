import { describe, expect, it } from "vitest"

import { notificationEventIdSchema } from "@acadigma/contracts"

import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_IDS,
  NOTIFICATION_PRIORITIES,
  UnknownNotificationEventError,
  actionUrlTemplateForEvent,
  categoryForEvent,
  catalogEntry,
  isNotificationEvent,
  priorityForEvent,
} from "./catalog"

describe("domain catalogue <-> contracts mirror parity", () => {
  it("declares exactly the same event ids as notificationEventIdSchema", () => {
    expect([...NOTIFICATION_EVENT_IDS].sort()).toEqual(
      [...notificationEventIdSchema.options].sort()
    )
  })
})

const EVENT_ID_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

describe("NOTIFICATION_CATALOG — v1 taxonomy completeness (F-ID-07 §5.1, §9.7-9.8)", () => {
  it("is a non-empty, stable snapshot of event ids (renaming one is a deliberate, reviewed change)", () => {
    expect(NOTIFICATION_EVENT_IDS.length).toBeGreaterThan(0)
    expect(NOTIFICATION_EVENT_IDS).toMatchSnapshot()
  })

  it("has no duplicate event ids", () => {
    expect(new Set(NOTIFICATION_EVENT_IDS).size).toBe(
      NOTIFICATION_EVENT_IDS.length
    )
  })

  it("names every event `{domain}.{event}`, lowercase and dot-separated", () => {
    for (const event of NOTIFICATION_EVENT_IDS) {
      expect(event).toMatch(EVENT_ID_PATTERN)
    }
  })

  it("gives every entry a known category, a known priority and a non-empty action_url", () => {
    for (const row of NOTIFICATION_CATALOG) {
      expect(NOTIFICATION_CATEGORIES).toContain(row.category)
      expect(NOTIFICATION_PRIORITIES).toContain(row.priority)
      expect(row.actionUrl.length).toBeGreaterThan(0)
      expect(row.recipients.length).toBeGreaterThan(0)
      expect(row.messageKey).toBe(`notifications.events.${row.event}`)
      for (const channel of row.defaultChannels) {
        expect(NOTIFICATION_CHANNELS).toContain(channel)
      }
    }
  })

  it("only marks platform.broadcast as priority-varying", () => {
    const varying = NOTIFICATION_CATALOG.filter((row) => row.priorityVaries)
    expect(varying.map((row) => row.event)).toEqual(["platform.broadcast"])
  })

  it("locks the in-app channel for every security-category event", () => {
    const security = NOTIFICATION_CATALOG.filter(
      (row) => row.category === "security"
    )
    expect(security.length).toBeGreaterThan(0)
    for (const row of security) {
      expect(row.inAppLocked).toBe(true)
    }
  })

  it("locks email only for billing.payment_failed", () => {
    const locked = NOTIFICATION_CATALOG.filter((row) => row.emailLocked)
    expect(locked.map((row) => row.event)).toEqual(["billing.payment_failed"])
  })

  it("covers every declared category with at least one event", () => {
    const used = new Set(NOTIFICATION_CATALOG.map((row) => row.category))
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(used.has(category)).toBe(true)
    }
  })
})

describe("catalog lookups", () => {
  it("finds a known event", () => {
    expect(isNotificationEvent("attendance.low")).toBe(true)
    expect(catalogEntry("attendance.low")?.category).toBe("academics")
    expect(categoryForEvent("attendance.low")).toBe("academics")
    expect(priorityForEvent("attendance.low")).toBe("high")
    expect(actionUrlTemplateForEvent("attendance.low")).toBe(
      "/app/attendance/alerts?section={id}"
    )
  })

  it("reports an unknown event as absent rather than throwing from the query helpers", () => {
    expect(isNotificationEvent("attendance.fabricated")).toBe(false)
    expect(catalogEntry("attendance.fabricated")).toBeUndefined()
  })

  it("throws a named error from the accessor helpers for an unknown event", () => {
    expect(() => categoryForEvent("not.real")).toThrow(
      UnknownNotificationEventError
    )
    expect(() => priorityForEvent("not.real")).toThrow(
      UnknownNotificationEventError
    )
    expect(() => actionUrlTemplateForEvent("not.real")).toThrow(
      UnknownNotificationEventError
    )
  })

  it("names the offending event on the error", () => {
    let caught: unknown
    try {
      categoryForEvent("ghost.event")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(UnknownNotificationEventError)
    expect((caught as UnknownNotificationEventError).event).toBe("ghost.event")
    expect((caught as Error).message).toContain("ghost.event")
  })

  it("resolves platform.broadcast's action_url as the {url} placeholder, not a fixed path", () => {
    expect(actionUrlTemplateForEvent("platform.broadcast")).toBe("{url}")
    expect(priorityForEvent("platform.broadcast")).toBe("normal")
    expect(catalogEntry("platform.broadcast")?.priorityVaries).toBe(true)
  })
})
