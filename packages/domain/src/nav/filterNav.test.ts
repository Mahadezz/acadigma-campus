import { describe, expect, it } from "vitest"

import { NAV_CONFIGS } from "./config"
import { filterNav, isRouteVisible } from "./filterNav"

import type { NavConfig } from "./types"

const SAMPLE: NavConfig = {
  bottom: [
    {
      id: "home",
      href: "/app/dashboard",
      labelEn: "Home",
      labelBn: "হোম",
      icon: "home",
    },
    {
      id: "billing",
      href: "/app/settings/billing",
      labelEn: "Billing",
      labelBn: "বিলিং",
      icon: "credit-card",
      roles: ["owner"],
      module: "billing",
    },
  ],
  more: [
    {
      id: "extras",
      labelEn: "Extras",
      labelBn: "অতিরিক্ত",
      items: [
        {
          id: "hiring",
          href: "/app/hiring",
          labelEn: "Hiring",
          labelBn: "নিয়োগ",
          icon: "briefcase",
          module: "hiring",
        },
        {
          id: "owner-only",
          href: "/app/danger",
          labelEn: "Danger zone",
          labelBn: "বিপজ্জনক",
          icon: "triangle-alert",
          roles: ["owner"],
        },
      ],
    },
  ],
}

describe("filterNav", () => {
  it("keeps an item with no roles/module restriction for every role", () => {
    const result = filterNav(SAMPLE, { role: "teacher" })
    expect(result.bottom.map((i) => i.id)).toContain("home")
  })

  it("drops an item whose roles list excludes the current role", () => {
    const result = filterNav(SAMPLE, { role: "teacher" })
    expect(result.bottom.map((i) => i.id)).not.toContain("billing")
  })

  it("keeps a role-restricted item for a role it lists", () => {
    const result = filterNav(SAMPLE, { role: "owner" })
    expect(result.bottom.map((i) => i.id)).toContain("billing")
  })

  it("drops a module item when the plan does not entitle it", () => {
    const result = filterNav(SAMPLE, {
      role: "owner",
      entitledModules: new Set(),
    })
    expect(result.bottom.map((i) => i.id)).not.toContain("billing")
  })

  it("keeps a module item when entitledModules is omitted entirely (no plan gate applied)", () => {
    const result = filterNav(SAMPLE, { role: "owner" })
    expect(result.bottom.map((i) => i.id)).toContain("billing")
  })

  it("drops a module item the owner explicitly hid, even though it is entitled", () => {
    const result = filterNav(SAMPLE, {
      role: "owner",
      entitledModules: new Set(["billing"]),
      hiddenModules: new Set(["billing"]),
    })
    expect(result.bottom.map((i) => i.id)).not.toContain("billing")
  })

  it("drops a whole More group once every item inside it is filtered out", () => {
    const result = filterNav(SAMPLE, {
      role: "teacher",
      entitledModules: new Set(), // hiring gone by module gate too
    })
    // "hiring" fails the module gate, "owner-only" fails the role gate -> group empty
    expect(result.more).toEqual([])
  })

  it("keeps a More group that still has at least one visible item", () => {
    const result = filterNav(SAMPLE, {
      role: "teacher",
      entitledModules: new Set(["hiring"]),
    })
    expect(result.more).toHaveLength(1)
    expect(result.more[0]?.items.map((i) => i.id)).toEqual(["hiring"])
  })

  it("applies an optional actionFor gate on top of roles/module", () => {
    const result = filterNav(SAMPLE, {
      role: "owner",
      actionFor: (item) => (item.id === "home" ? "settings.manage" : undefined),
    })
    // owner can settings.manage, so "home" survives; nothing else declares an action
    expect(result.bottom.map((i) => i.id)).toContain("home")
  })

  it("removes an item when actionFor names an action the role does not hold", () => {
    const result = filterNav(SAMPLE, {
      role: "teacher",
      actionFor: (item) => (item.id === "home" ? "settings.manage" : undefined),
    })
    expect(result.bottom.map((i) => i.id)).not.toContain("home")
  })

  it("is pure: never mutates the input config", () => {
    const before = JSON.stringify(SAMPLE)
    filterNav(SAMPLE, { role: "teacher" })
    expect(JSON.stringify(SAMPLE)).toBe(before)
  })

  it("produces the same filtered output for the same input (deterministic)", () => {
    const a = filterNav(SAMPLE, { role: "admin" })
    const b = filterNav(SAMPLE, { role: "admin" })
    expect(a).toEqual(b)
  })
})

describe("isRouteVisible", () => {
  it("is true for a bottom-nav route the role can see", () => {
    expect(isRouteVisible(SAMPLE, { role: "teacher" }, "/app/dashboard")).toBe(
      true
    )
  })

  it("is true for a nested path under a visible route", () => {
    expect(
      isRouteVisible(SAMPLE, { role: "owner" }, "/app/dashboard/widgets")
    ).toBe(true)
  })

  it("is false for a route hidden by role", () => {
    expect(
      isRouteVisible(SAMPLE, { role: "teacher" }, "/app/settings/billing")
    ).toBe(false)
  })

  it("is false for a route hidden by module visibility (F-ID-03 §4.9, AC11)", () => {
    expect(
      isRouteVisible(
        SAMPLE,
        { role: "owner", hiddenModules: new Set(["hiring"]) },
        "/app/hiring"
      )
    ).toBe(false)
  })

  it("is true once the module is visible again", () => {
    expect(
      isRouteVisible(
        SAMPLE,
        { role: "owner", hiddenModules: new Set() },
        "/app/hiring"
      )
    ).toBe(true)
  })

  it("is false for a route that does not exist in the config at all", () => {
    expect(isRouteVisible(SAMPLE, { role: "owner" }, "/app/nonexistent")).toBe(
      false
    )
  })
})

describe("filterNav against the real DESIGN-SYSTEM §3.2 configs", () => {
  it("gives an admin the Billing & plan and Audit log items, a teacher neither", () => {
    const config = NAV_CONFIGS["school:owner_admin"]

    const forOwner = filterNav(config, { role: "owner" })
    const ownerMoreIds = forOwner.more.flatMap((g) => g.items.map((i) => i.id))
    expect(ownerMoreIds).toContain("billing")
    expect(ownerMoreIds).toContain("audit-log")

    const forAdmin = filterNav(config, { role: "admin" })
    const adminMoreIds = forAdmin.more.flatMap((g) => g.items.map((i) => i.id))
    expect(adminMoreIds).not.toContain("billing")
    expect(adminMoreIds).not.toContain("audit-log")
  })

  it("hides a module from both bottom and more once the owner hides it workspace-wide", () => {
    const config = NAV_CONFIGS["school:teacher"]
    const before = filterNav(config, { role: "teacher" })
    expect(before.bottom.map((i) => i.id)).toContain("attendance")

    const after = filterNav(config, {
      role: "teacher",
      hiddenModules: new Set(["attendance"]),
    })
    expect(after.bottom.map((i) => i.id)).not.toContain("attendance")
    const afterMoreIds = after.more.flatMap((g) => g.items.map((i) => i.id))
    expect(afterMoreIds).not.toContain("self-checkin") // also gated on module "attendance"
  })

  it("keeps the flat personal config identical across every role", () => {
    const config = NAV_CONFIGS["personal:owner"]
    const forOwner = filterNav(config, { role: "owner" })
    const forParent = filterNav(config, { role: "parent" })
    expect(forOwner).toEqual(forParent)
  })
})
