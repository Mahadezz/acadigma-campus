import { describe, expect, it } from "vitest"

import { getNavConfig, resolveNavConfigKey } from "@acadigma/domain/nav"

import {
  filterNavConfig,
  personalNav,
  schoolAdminNav,
  schoolStaffNav,
  schoolTeacherNav,
  sellerNav,
  platformNav,
  parentNav,
} from "./nav-config"

describe("this package's curated trees are the domain package's trees", () => {
  it("re-exports the exact NAV_CONFIGS object domain resolves by role (no copy drift)", () => {
    expect(schoolAdminNav).toBe(getNavConfig("school", "owner"))
    expect(schoolTeacherNav).toBe(getNavConfig("school", "teacher"))
    expect(schoolStaffNav).toBe(getNavConfig("school", "staff"))
    expect(parentNav).toBe(getNavConfig("school", "parent"))
    expect(personalNav).toBe(getNavConfig("personal", "owner"))
  })
})

describe("role -> tree selection (DESIGN-SYSTEM §3.2)", () => {
  it("resolves each school role to its own curated key", () => {
    expect(resolveNavConfigKey("school", "owner")).toBe("school:owner_admin")
    expect(resolveNavConfigKey("school", "admin")).toBe("school:owner_admin")
    expect(resolveNavConfigKey("school", "teacher")).toBe("school:teacher")
    expect(resolveNavConfigKey("school", "staff")).toBe("school:staff")
    expect(resolveNavConfigKey("school", "parent")).toBe("family:parent")
  })

  it("resolves every personal-workspace role to the flat personal tree", () => {
    expect(resolveNavConfigKey("personal", "owner")).toBe("personal:owner")
    expect(resolveNavConfigKey("personal", "teacher")).toBe("personal:owner")
  })
})

describe("filterNavConfig — role and module filtering through the ui adapter", () => {
  it("hides a module-gated item once the module is not entitled", () => {
    const filtered = filterNavConfig(schoolTeacherNav, {
      role: "teacher",
      hasModule: (module) => module !== "attendance",
    })
    expect(filtered.bottom.map((i) => i.id)).not.toContain("attendance")
  })

  it("keeps owner-only More items for the owner and drops them for the admin", () => {
    const forOwner = filterNavConfig(schoolAdminNav, {
      role: "owner",
      hasModule: () => true,
    })
    const forAdmin = filterNavConfig(schoolAdminNav, {
      role: "admin",
      hasModule: () => true,
    })
    const ownerIds = forOwner.more.flatMap((g) => g.items.map((i) => i.id))
    const adminIds = forAdmin.more.flatMap((g) => g.items.map((i) => i.id))
    expect(ownerIds).toContain("billing")
    expect(ownerIds).toContain("audit-log")
    expect(adminIds).not.toContain("billing")
    expect(adminIds).not.toContain("audit-log")
  })

  it("caps bottom items at BOTTOM_NAV_PRIMARY_MAX (4) even for a flat config", () => {
    const filtered = filterNavConfig(personalNav, {
      role: "owner",
      hasModule: () => true,
    })
    expect(filtered.bottom.length).toBeLessThanOrEqual(4)
  })

  it("does not gate the seller/platform trees on a WorkspaceRole (no item declares roles)", () => {
    const forSeller = filterNavConfig(sellerNav, {
      role: "not-a-workspace-role",
      hasModule: () => true,
    })
    expect(forSeller.bottom.map((i) => i.id)).toEqual(
      sellerNav.bottom.map((i) => i.id)
    )

    const forPlatform = filterNavConfig(platformNav, {
      role: "not-a-workspace-role",
      hasModule: () => true,
    })
    expect(forPlatform.bottom.map((i) => i.id)).toEqual(
      platformNav.bottom.map((i) => i.id)
    )
  })
})
