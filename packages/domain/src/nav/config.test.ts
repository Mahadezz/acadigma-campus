import { describe, expect, it } from "vitest"

import { WORKSPACE_ROLES } from "../permissions"

import { NAV_CONFIGS, getNavConfig, resolveNavConfigKey } from "./config"
import { BOTTOM_NAV_PRIMARY_MAX, NAV_CONFIG_KEYS } from "./types"

describe("NAV_CONFIGS", () => {
  it("defines exactly the five curated layouts", () => {
    expect(Object.keys(NAV_CONFIGS).sort()).toEqual([...NAV_CONFIG_KEYS].sort())
  })

  it("never exceeds the primary bottom-nav slot count", () => {
    for (const key of NAV_CONFIG_KEYS) {
      expect(NAV_CONFIGS[key].bottom.length).toBeLessThanOrEqual(
        BOTTOM_NAV_PRIMARY_MAX
      )
    }
  })

  it("gives every bottom item and every more item a unique id within its config", () => {
    for (const key of NAV_CONFIG_KEYS) {
      const config = NAV_CONFIGS[key]
      const ids = [
        ...config.bottom.map((i) => i.id),
        ...config.more.flatMap((g) => g.items.map((i) => i.id)),
      ]
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it("gives every item both an English and a Bangla label", () => {
    for (const key of NAV_CONFIG_KEYS) {
      const config = NAV_CONFIGS[key]
      const items = [...config.bottom, ...config.more.flatMap((g) => g.items)]
      for (const item of items) {
        expect(item.labelEn.length).toBeGreaterThan(0)
        expect(item.labelBn.length).toBeGreaterThan(0)
      }
    }
  })

  it("keeps the personal workspace flat: no item is role-restricted", () => {
    const config = NAV_CONFIGS["personal:owner"]
    const items = [...config.bottom, ...config.more.flatMap((g) => g.items)]
    for (const item of items) {
      expect(item.roles).toBeUndefined()
    }
  })
})

describe("resolveNavConfigKey / getNavConfig", () => {
  it("sends every personal role to the flat personal config", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(resolveNavConfigKey("personal", role)).toBe("personal:owner")
    }
  })

  it("sends owner and admin to the shared owner_admin config", () => {
    expect(resolveNavConfigKey("school", "owner")).toBe("school:owner_admin")
    expect(resolveNavConfigKey("school", "admin")).toBe("school:owner_admin")
  })

  it("sends teacher, staff and parent to their own configs", () => {
    expect(resolveNavConfigKey("school", "teacher")).toBe("school:teacher")
    expect(resolveNavConfigKey("school", "staff")).toBe("school:staff")
    expect(resolveNavConfigKey("school", "parent")).toBe("family:parent")
  })

  it("getNavConfig returns the exact object NAV_CONFIGS holds for the key", () => {
    expect(getNavConfig("school", "owner")).toBe(
      NAV_CONFIGS["school:owner_admin"]
    )
    expect(getNavConfig("personal", "teacher")).toBe(
      NAV_CONFIGS["personal:owner"]
    )
  })
})
