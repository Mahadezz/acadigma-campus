// @vitest-environment node
import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { NAV_CONFIGS, getNavConfig } from "@acadigma/domain/nav"

import { backTarget } from "./back-route"
import { onlyImplemented } from "./implemented-routes"

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url))

/** Every page route under app/, route groups removed, `[x]` kept. */
function pageRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = /^\(.*\)$/.test(entry.name)
      routes.push(
        ...pageRoutes(
          path.join(dir, entry.name),
          isGroup ? segments : [...segments, entry.name]
        )
      )
    } else if (entry.name === "page.tsx") {
      routes.push("/" + segments.join("/"))
    }
  }
  return routes
}

const PAGES = pageRoutes(APP_DIR)
const owner = onlyImplemented(getNavConfig("school", "owner")!)

describe("backTarget", () => {
  it("gives top-level pages no back target", () => {
    for (const p of ["/app", "/app/dashboard", "/app/exams", "/app/home"]) {
      expect(backTarget(p, owner), p).toBeNull()
    }
    // A nav destination reached through More is still top-level.
    expect(backTarget("/app/staff/team", owner)).toBeNull()
    expect(backTarget("/family", null)).toBeNull()
    // Outside the three shells: nothing.
    expect(backTarget("/login", owner)).toBeNull()
  })

  it("walks up to the nearest nameable ancestor", () => {
    expect(backTarget("/app/exams/e1", owner)).toMatchObject({
      href: "/app/exams",
      labelEn: "Exams",
    })
    expect(backTarget("/app/exams/e1/results", owner)).toEqual({
      href: "/app/exams/e1",
      labelEn: "Exam",
      labelBn: "পরীক্ষা",
    })
    expect(backTarget("/app/settings/appearance/", owner)?.href).toBe(
      "/app/settings"
    )
    // /app/marks has no page: skip it, land on the shell's first tab.
    expect(backTarget("/app/marks/x", owner)?.href).toBe("/app/dashboard")
    // A shell with no nav wired yet falls back to its root.
    expect(backTarget("/family/child/1", null)).toEqual({
      href: "/family",
      labelEn: "Home",
      labelBn: "হোম",
    })
  })

  it("sends every real page to a parent that is a real page, for every role", () => {
    const pageExists = (href: string) =>
      PAGES.some((p) => {
        const a = p.split("/")
        const b = href.split("/")
        return (
          a.length === b.length &&
          a.every((seg, i) => seg === b[i] || /^\[.+\]$/.test(seg))
        )
      })
    for (const config of Object.values(NAV_CONFIGS).map(onlyImplemented)) {
      for (const page of PAGES) {
        // Concrete ids stand in for dynamic segments.
        const concrete = page.replace(/\[[^\]]+\]/g, "x1")
        const target = backTarget(concrete, config)
        if (target) {
          expect(pageExists(target.href), `${page} -> ${target.href}`).toBe(
            true
          )
        }
      }
    }
  })
})
