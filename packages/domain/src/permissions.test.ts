import { describe, expect, it } from "vitest"

import {
  ACTIONS,
  PERMISSIONS,
  PermissionDeniedError,
  ROLES,
  WORKSPACE_ROLES,
  actionsForRole,
  assertCan,
  can,
  canAll,
  canAny,
  isRole,
  isWorkspaceRole,
  rolesWithAction,
  type Role,
} from "./permissions"

describe("the matrix itself", () => {
  it("gives every role an entry", () => {
    for (const role of ROLES) {
      expect(PERMISSIONS[role]).toBeDefined()
    }
  })

  it("only grants actions that exist", () => {
    for (const role of ROLES) {
      for (const action of PERMISSIONS[role]) {
        expect(ACTIONS).toContain(action)
      }
    }
  })

  it("never lists the same action twice for a role", () => {
    for (const role of ROLES) {
      const granted = PERMISSIONS[role]
      expect(new Set(granted).size).toBe(granted.length)
    }
  })

  it("grants every declared action to at least one role", () => {
    for (const action of ACTIONS) {
      expect(rolesWithAction(action).length).toBeGreaterThan(0)
    }
  })
})

describe("tenant separation", () => {
  it("keeps platform staff out of a tenant's academic data", () => {
    const forbidden = [
      "attendance.write",
      "students.write",
      "marks.write",
      "members.manage",
      "billing.manage",
    ] as const
    for (const action of forbidden) {
      expect(can("platform", action)).toBe(false)
    }
  })

  it("keeps workspace roles out of the platform console", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(can(role, "platform.console")).toBe(false)
      expect(can(role, "listing.review")).toBe(false)
      expect(can(role, "payouts.manage")).toBe(false)
    }
  })
})

describe("role shapes", () => {
  it("makes the parent portal read-only", () => {
    const writes = [
      "attendance.write",
      "students.write",
      "marks.write",
      "timetable.manage",
      "members.manage",
      "settings.manage",
    ] as const
    for (const action of writes) {
      expect(can("parent", action)).toBe(false)
    }
    expect(can("parent", "attendance.read")).toBe(true)
  })

  it("lets teachers take attendance and enter marks", () => {
    expect(can("teacher", "attendance.write")).toBe(true)
    expect(can("teacher", "marks.write")).toBe(true)
  })

  it("keeps money and workspace settings with the owner", () => {
    expect(can("owner", "billing.manage")).toBe(true)
    expect(can("owner", "settings.manage")).toBe(true)
    expect(can("admin", "billing.manage")).toBe(false)
    expect(can("admin", "settings.manage")).toBe(false)
    expect(can("admin", "billing.read")).toBe(true)
  })

  it("gives office staff no write action at all", () => {
    const writeActions = ACTIONS.filter(
      (action) =>
        action.endsWith(".write") ||
        action.endsWith(".manage") ||
        action.endsWith(".create")
    )
    for (const action of writeActions) {
      expect(can("staff", action)).toBe(false)
    }
  })
})

describe("can / canAll / canAny", () => {
  it("answers a single action", () => {
    expect(can("owner", "members.manage")).toBe(true)
    expect(can("teacher", "members.manage")).toBe(false)
  })

  it("requires every action for canAll", () => {
    expect(canAll("teacher", ["attendance.read", "attendance.write"])).toBe(
      true
    )
    expect(canAll("teacher", ["attendance.write", "billing.manage"])).toBe(
      false
    )
    expect(canAll("staff", [])).toBe(true)
  })

  it("requires one action for canAny", () => {
    expect(canAny("staff", ["billing.manage", "students.read"])).toBe(true)
    expect(canAny("staff", ["billing.manage", "settings.manage"])).toBe(false)
    expect(canAny("owner", [])).toBe(false)
  })
})

describe("actionsForRole", () => {
  it("returns the role's own list", () => {
    expect(actionsForRole("parent")).toEqual(PERMISSIONS.parent)
  })
})

describe("rolesWithAction", () => {
  it("lists the roles that hold an action", () => {
    expect(rolesWithAction("platform.console")).toEqual(["platform"])
    expect(rolesWithAction("attendance.write").sort()).toEqual([
      "admin",
      "owner",
      "teacher",
    ])
  })
})

describe("type guards", () => {
  it("recognises valid roles", () => {
    expect(isRole("owner")).toBe(true)
    expect(isRole("platform")).toBe(true)
    expect(isRole("superuser")).toBe(false)
    expect(isRole(42)).toBe(false)
    expect(isRole(null)).toBe(false)
  })

  it("separates workspace roles from platform staff", () => {
    expect(isWorkspaceRole("teacher")).toBe(true)
    expect(isWorkspaceRole("platform")).toBe(false)
    expect(isWorkspaceRole(undefined)).toBe(false)
  })
})

describe("assertCan", () => {
  it("passes silently when allowed", () => {
    expect(() => assertCan("owner", "billing.manage")).not.toThrow()
  })

  it("throws PermissionDeniedError carrying the role and action", () => {
    let caught: unknown
    try {
      assertCan("parent", "marks.write")
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PermissionDeniedError)
    const denied = caught as PermissionDeniedError
    expect(denied.role).toBe<Role>("parent")
    expect(denied.action).toBe("marks.write")
    expect(denied.name).toBe("PermissionDeniedError")
    expect(denied.message).toContain("marks.write")
  })
})
