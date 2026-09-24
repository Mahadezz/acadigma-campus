import { describe, expect, it } from "vitest"

import { WORKSPACE_ROLES } from "../permissions"

import { resolveShellGate, type ShellName } from "./shellGate"

const SHELLS: ShellName[] = ["school", "personal", "family"]

describe("resolveShellGate", () => {
  it("allows a staff role into the school shell, and only a staff role", () => {
    const staffRoles = WORKSPACE_ROLES.filter((r) => r !== "parent")
    for (const role of staffRoles) {
      expect(
        resolveShellGate("school", { workspaceType: "school", role })
      ).toEqual({ kind: "allow" })
    }
  })

  it("redirects a parent away from the school shell to /family", () => {
    expect(
      resolveShellGate("school", { workspaceType: "school", role: "parent" })
    ).toEqual({ kind: "redirect", to: "/family" })
  })

  it("redirects a personal-workspace user away from the school shell to /personal", () => {
    expect(
      resolveShellGate("school", { workspaceType: "personal", role: "owner" })
    ).toEqual({ kind: "redirect", to: "/personal" })
  })

  it("allows a parent into the family shell, and only a parent", () => {
    expect(
      resolveShellGate("family", { workspaceType: "school", role: "parent" })
    ).toEqual({ kind: "allow" })

    const staffRoles = WORKSPACE_ROLES.filter((r) => r !== "parent")
    for (const role of staffRoles) {
      expect(
        resolveShellGate("family", { workspaceType: "school", role })
      ).toEqual({ kind: "redirect", to: "/app" })
    }
  })

  it("redirects a personal-workspace user away from the family shell to /personal", () => {
    expect(
      resolveShellGate("family", { workspaceType: "personal", role: "owner" })
    ).toEqual({ kind: "redirect", to: "/personal" })
  })

  it("allows a personal workspace into the personal shell regardless of role", () => {
    expect(
      resolveShellGate("personal", { workspaceType: "personal", role: "owner" })
    ).toEqual({ kind: "allow" })
    expect(resolveShellGate("personal", { workspaceType: "personal" })).toEqual(
      { kind: "allow" }
    )
  })

  it("redirects every school role away from the personal shell", () => {
    for (const role of WORKSPACE_ROLES) {
      const expected = role === "parent" ? "/family" : "/app"
      expect(
        resolveShellGate("personal", { workspaceType: "school", role })
      ).toEqual({ kind: "redirect", to: expected })
    }
  })

  it("fails closed to forbidden when there is no active membership at all", () => {
    for (const shell of SHELLS) {
      expect(resolveShellGate(shell, { workspaceType: null })).toEqual({
        kind: "forbidden",
      })
    }
  })

  it("fails closed to forbidden on a school workspace with no resolved role", () => {
    for (const shell of SHELLS) {
      expect(
        resolveShellGate(shell, { workspaceType: "school", role: null })
      ).toEqual({ kind: "forbidden" })
      expect(resolveShellGate(shell, { workspaceType: "school" })).toEqual({
        kind: "forbidden",
      })
    }
  })

  it("full matrix: every (shell, workspaceType, role) combination is decided", () => {
    const workspaceTypes = ["school", "personal"] as const
    for (const shell of SHELLS) {
      for (const workspaceType of workspaceTypes) {
        for (const role of WORKSPACE_ROLES) {
          const decision = resolveShellGate(shell, { workspaceType, role })
          expect(["allow", "redirect", "forbidden"]).toContain(decision.kind)
        }
      }
    }
  })
})
