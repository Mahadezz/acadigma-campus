// @vitest-environment node
import { describe, expect, it } from "vitest"

import { getNavConfig } from "@acadigma/domain/nav"

import { PAGE_ROUTES } from "@/test/page-routes"

import { backTarget, matches, navLabel } from "./back-route"

describe("backTarget", () => {
  it("gives top-level pages no back target", () => {
    for (const p of [
      "/app",
      "/app/dashboard",
      "/app/exams",
      "/app/settings/",
      "/app/home",
      "/family",
      "/personal",
    ]) {
      expect(backTarget(p), p).toBeNull()
    }
    // Outside the three shells: nothing.
    expect(backTarget("/login")).toBeNull()
  })

  it("walks up to the nearest nameable ancestor", () => {
    expect(backTarget("/app/exams/e1")).toEqual({ href: "/app/exams" })
    expect(backTarget("/app/exams/e1/results")).toEqual({
      href: "/app/exams/e1",
      labelEn: "Exam",
      labelBn: "পরীক্ষা",
    })
    expect(backTarget("/app/settings/appearance")?.href).toBe("/app/settings")
    // A nav destination nested under another one still gets a way up.
    expect(backTarget("/app/staff/team")?.href).toBe("/app/staff")
    // /app/marks has no page: skip it, land on the shell root (home).
    expect(backTarget("/app/marks/x")).toEqual({
      href: "/app",
      labelEn: "Home",
      labelBn: "হোম",
    })
    expect(backTarget("/family/child/1")?.href).toBe("/family")
  })

  it("sends every real page to a parent that is a real page", () => {
    for (const page of PAGE_ROUTES) {
      // Concrete ids stand in for dynamic segments.
      const target = backTarget(page.replace(/\[[^\]]+\]/g, "x1"))
      if (target) {
        expect(
          PAGE_ROUTES.some((p) => matches(p, target.href)),
          `${page} -> ${target.href}`
        ).toBe(true)
      }
    }
  })
})

describe("navLabel", () => {
  it("names a nav destination from the member's own config", () => {
    const owner = getNavConfig("school", "owner")
    expect(navLabel("/app/exams", owner)?.labelEn).toBe("Exams")
    expect(navLabel("/nowhere", owner)).toBeUndefined()
    expect(navLabel("/app/exams", null)).toBeUndefined()
  })
})
