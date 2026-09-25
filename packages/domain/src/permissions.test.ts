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
  type Action,
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

  it("keeps money and owner-only workspace settings with the owner", () => {
    expect(can("owner", "billing.manage")).toBe(true)
    expect(can("owner", "settings.manage")).toBe(true)
    expect(can("admin", "billing.manage")).toBe(false)
    expect(can("admin", "settings.manage")).toBe(false)
    expect(can("admin", "billing.read")).toBe(true)
  })

  it("lets owner and admin both manage the F-OP-07 policy blobs (school_profiles RLS §3.1)", () => {
    expect(can("owner", "policies.manage")).toBe(true)
    expect(can("admin", "policies.manage")).toBe(true)
    expect(can("teacher", "policies.manage")).toBe(false)
    expect(can("staff", "policies.manage")).toBe(false)
    expect(can("parent", "policies.manage")).toBe(false)
  })

  it("gives office staff no administrative write action", () => {
    // F-ID-03 §2 grants staff exactly one ".write" action: editing their OWN
    // staff fields (row-scoped, enforced outside this coarse matrix — see the
    // ACTIONS comment). Every other write/manage/create action stays denied.
    const ownRowException: readonly Action[] = ["members.staff_fields.write"]
    const writeActions = ACTIONS.filter(
      (action) =>
        (action.endsWith(".write") ||
          action.endsWith(".manage") ||
          action.endsWith(".create")) &&
        !ownRowException.includes(action)
    )
    for (const action of writeActions) {
      expect(can("staff", action)).toBe(false)
    }
    expect(can("staff", "members.staff_fields.write")).toBe(true)
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

describe("F-ID-03 §2 tenancy & membership matrix — transcribed exactly", () => {
  // One row per F-ID-03 §2 table row, in the table's own order. If a reviewer
  // changes the spec table, this is the one test that must change with it —
  // and any row left out here fails the "every action has an entry" check below.
  const TABLE: Record<Action, readonly Role[]> = {
    "workspace.read": [
      "owner",
      "admin",
      "teacher",
      "staff",
      "parent",
      "platform",
    ],
    "workspace.settings.write": ["owner", "admin"],
    "workspace.branding.write": ["owner", "admin"],
    "calendar.holiday.write": ["owner", "admin"],
    "members.read": ["owner", "admin", "teacher", "staff", "platform"],
    "members.contact.read": ["owner", "admin", "platform"],
    "members.invite": ["owner", "admin"],
    "members.approve": ["owner", "admin"],
    "members.role.write": ["owner", "admin"],
    "members.staff_fields.write": ["owner", "admin", "teacher", "staff"],
    "members.remove": ["owner", "admin"],
    "members.leave": ["owner", "admin", "teacher", "staff", "parent"],
    "workspace.ownership.transfer": ["owner"],
    "labels.write": ["owner", "admin"],
    "labels.assign": ["owner", "admin"],
    "modules.visibility.write": ["owner"],
    "workspace.archive": ["owner", "platform"],
    "platform.workspace.suspend": ["platform"],
    // The rest of ACTIONS predates F-ID-03 and is out of this table's scope;
    // TypeScript still requires every key, so they are asserted against the
    // matrix as-is (a no-op check that keeps this Record exhaustive).
    "attendance.read": [...rolesWithAction("attendance.read")],
    "attendance.write": [...rolesWithAction("attendance.write")],
    "students.read": [...rolesWithAction("students.read")],
    "students.write": [...rolesWithAction("students.write")],
    "marks.read": [...rolesWithAction("marks.read")],
    "marks.write": [...rolesWithAction("marks.write")],
    "timetable.read": [...rolesWithAction("timetable.read")],
    "timetable.manage": [...rolesWithAction("timetable.manage")],
    "members.manage": [...rolesWithAction("members.manage")],
    "billing.read": [...rolesWithAction("billing.read")],
    "billing.manage": [...rolesWithAction("billing.manage")],
    "settings.manage": [...rolesWithAction("settings.manage")],
    "policies.manage": [...rolesWithAction("policies.manage")],
    // F-AC-06 §2 — asserted explicitly, not derived.
    "settings.grade_scale.write": ["owner", "admin"],
    "exams.read": ["owner", "admin", "teacher", "staff"],
    "exams.write": ["owner", "admin"],
    "reports.read": [...rolesWithAction("reports.read")],
    "messages.send": [...rolesWithAction("messages.send")],
    "ai.use": [...rolesWithAction("ai.use")],
    "listing.create": [...rolesWithAction("listing.create")],
    "listing.review": [...rolesWithAction("listing.review")],
    "payouts.manage": [...rolesWithAction("payouts.manage")],
    "platform.console": [...rolesWithAction("platform.console")],
    "audit.read": [...rolesWithAction("audit.read")],
    "audit.read.platform": [...rolesWithAction("audit.read.platform")],
    "audit.read.self": [...rolesWithAction("audit.read.self")],
    "audit.export": [...rolesWithAction("audit.export")],
    "report.view": [...rolesWithAction("report.view")],
    "report.render.sample": [...rolesWithAction("report.render.sample")],
    "report.render.report_card": [
      ...rolesWithAction("report.render.report_card"),
    ],
    // F-AC-01 §2 (D-102): asserted for real, not against the matrix itself.
    "academics.structure.read": ["owner", "admin", "teacher", "staff"],
    "academics.section.write": ["owner", "admin"],
    "academics.subject.write": ["owner", "admin"],
    // F-AC-02 §2 (D-103); RLS narrows teachers to the class teacher.
    "students.read_sensitive": ["owner", "admin", "teacher"],
  }

  it("gives every declared action in ACTIONS an entry in this table", () => {
    for (const action of ACTIONS) {
      expect(TABLE).toHaveProperty(action)
    }
    // and no stray keys that are not real actions
    for (const key of Object.keys(TABLE)) {
      expect(ACTIONS).toContain(key)
    }
  })

  it("matches PERMISSIONS exactly for every §2 action, role by role", () => {
    for (const [action, expectedRoles] of Object.entries(TABLE) as [
      Action,
      readonly Role[],
    ][]) {
      for (const role of ROLES) {
        const expected = expectedRoles.includes(role)
        expect(
          can(role, action),
          `can(${role}, ${action}) should be ${expected}`
        ).toBe(expected)
      }
    }
  })
})

describe("can: deny-by-default on inputs the type system says cannot happen", () => {
  // Each of these is a string that could reach can() from a JWT claim, a
  // database row or a JSON body without passing isRole() or an Action literal.
  // The contract is that they are DENIED, not that they throw: assertCan is the
  // guard at the top of every server action, so a throw here is a 500 instead
  // of a 403, and an unhandled path is where bypasses live.
  const unknownRoles = ["", "Owner", "superuser", "__proto__", "constructor"]

  it.each(unknownRoles)(
    "denies the unknown role %j without throwing",
    (role) => {
      expect(() => can(role as Role, "attendance.read")).not.toThrow()
      expect(can(role as Role, "attendance.read")).toBe(false)
    }
  )

  it("denies an unknown action for a real role", () => {
    expect(can("owner", "attendance.destroy" as Action)).toBe(false)
    expect(can("owner", "" as Action)).toBe(false)
  })

  it("denies when both the role and the action are unknown", () => {
    expect(can("superuser" as Role, "everything.always" as Action)).toBe(false)
  })

  it("makes assertCan deny an unknown role rather than crash", () => {
    expect(() => assertCan("superuser" as Role, "billing.manage")).toThrow(
      PermissionDeniedError
    )
  })
})

describe("F-OP-03 §2 reports and PDF — Parts 1-3 keys", () => {
  it("grants report.view, report.render.sample and report.render.report_card to owner, admin and teacher", () => {
    for (const role of ["owner", "admin", "teacher"] as const) {
      expect(can(role, "report.view")).toBe(true)
      expect(can(role, "report.render.sample")).toBe(true)
      expect(can(role, "report.render.report_card")).toBe(true)
    }
  })

  it("grants staff report.view and report.render.report_card, not the sample kind (D-206)", () => {
    expect(can("staff", "report.view")).toBe(true)
    expect(can("staff", "report.render.report_card")).toBe(true)
    expect(can("staff", "report.render.sample")).toBe(false)
  })

  it("denies all three to parent and platform", () => {
    for (const role of ["parent", "platform"] as const) {
      expect(can(role, "report.view")).toBe(false)
      expect(can(role, "report.render.sample")).toBe(false)
      expect(can(role, "report.render.report_card")).toBe(false)
    }
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
