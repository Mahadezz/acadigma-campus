import { describe, expect, it } from "vitest"

import { roleChangeDelta, roleHeadlineCapabilities } from "./roleChange"

describe("roleHeadlineCapabilities", () => {
  it("gives the owner every headline capability", () => {
    expect(roleHeadlineCapabilities("owner")).toEqual([
      "manageTeam",
      "manageBilling",
      "manageSettings",
      "editMarks",
      "takeAttendance",
      "viewReports",
    ])
  })

  it("does not credit an admin with billing (owner-only)", () => {
    const caps = roleHeadlineCapabilities("admin")
    expect(caps).toContain("manageTeam")
    expect(caps).toContain("manageSettings")
    expect(caps).not.toContain("manageBilling")
  })

  it("gives a teacher classroom abilities but not team management", () => {
    const caps = roleHeadlineCapabilities("teacher")
    expect(caps).toContain("editMarks")
    expect(caps).toContain("takeAttendance")
    expect(caps).not.toContain("manageTeam")
    expect(caps).not.toContain("manageSettings")
  })

  it("gives staff only read-side reports, no writes", () => {
    const caps = roleHeadlineCapabilities("staff")
    expect(caps).toEqual(["viewReports"])
  })
})

describe("roleChangeDelta", () => {
  it("promoting teacher → admin gains team + settings, loses nothing", () => {
    const { gained, lost } = roleChangeDelta("teacher", "admin")
    expect(gained).toEqual(["manageTeam", "manageSettings"])
    expect(lost).toEqual([])
  })

  it("demoting admin → teacher loses team + settings", () => {
    const { gained, lost } = roleChangeDelta("admin", "teacher")
    expect(gained).toEqual([])
    expect(lost).toEqual(["manageTeam", "manageSettings"])
  })

  it("teacher → staff loses the classroom write abilities", () => {
    const { gained, lost } = roleChangeDelta("teacher", "staff")
    expect(gained).toEqual([])
    expect(lost).toEqual(["editMarks", "takeAttendance"])
  })

  it("a no-op change has no gains or losses", () => {
    expect(roleChangeDelta("teacher", "teacher")).toEqual({
      gained: [],
      lost: [],
    })
  })
})
