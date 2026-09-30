// @vitest-environment node
import { describe, expect, it } from "vitest"

import { NAV_CONFIGS, type NavConfig } from "@acadigma/domain/nav"

import { PAGE_ROUTES } from "@/test/page-routes"

import { IMPLEMENTED_NAV_ROUTES, onlyImplemented } from "./implemented-routes"

const PAGES = new Set(PAGE_ROUTES)
const NAV_HREFS = new Set(
  Object.values(NAV_CONFIGS).flatMap((config) => [
    ...config.bottom.map((item) => item.href),
    ...config.more.flatMap((group) => group.items.map((item) => item.href)),
  ])
)

describe("IMPLEMENTED_NAV_ROUTES", () => {
  it("lists only routes that have a page.tsx", () => {
    for (const route of IMPLEMENTED_NAV_ROUTES) {
      expect(PAGES, `${route} is listed but has no page.tsx`).toContain(route)
    }
  })

  it("lists every nav destination that has a page.tsx", () => {
    for (const href of NAV_HREFS) {
      if (PAGES.has(href)) {
        expect(
          IMPLEMENTED_NAV_ROUTES,
          `${href} has a page but is missing from IMPLEMENTED_NAV_ROUTES`
        ).toContain(href)
      }
    }
  })
})

describe("onlyImplemented", () => {
  const item = (href: string) => ({
    id: href,
    href,
    labelEn: href,
    labelBn: href,
    icon: "circle",
  })
  const config: NavConfig = {
    bottom: [item("/app/dashboard"), item("/app/timetable")],
    more: [
      { id: "a", labelEn: "A", labelBn: "A", items: [item("/app/timetable")] },
      {
        id: "b",
        labelEn: "B",
        labelBn: "B",
        items: [item("/app/settings"), item("/app/hiring")],
      },
    ],
  }

  it("hides unimplemented items and drops groups left empty", () => {
    const result = onlyImplemented(config)
    expect(result.bottom.map((i) => i.href)).toEqual(["/app/dashboard"])
    expect(result.more.map((g) => g.id)).toEqual(["b"])
    expect(result.more[0]?.items.map((i) => i.href)).toEqual(["/app/settings"])
  })

  it("keeps the school owner nav down to real pages only", () => {
    const owner = onlyImplemented(NAV_CONFIGS["school:owner_admin"])
    const hrefs = [
      ...owner.bottom.map((i) => i.href),
      ...owner.more.flatMap((g) => g.items.map((i) => i.href)),
    ]
    for (const href of hrefs) expect(PAGES).toContain(href)
    expect(hrefs).toContain("/app/dashboard")
  })
})
