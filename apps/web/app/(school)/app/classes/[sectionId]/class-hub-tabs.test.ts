import { describe, expect, it } from "vitest"

import { CLASS_HUB_TABS } from "@acadigma/domain/class-hub"

import { TAB_ICONS } from "./class-hub-view"

/** Keeps `CLASS_HUB_TABS` (the registry) and `TAB_ICONS` (the view's own
 * icon lookup) in step — the same two-directions idea
 * `implemented-routes.test.ts` already uses for pages (referenced by the
 * registry's own doc comment). A tab added to one without the other either
 * never renders (missing here) or renders with no icon (missing there). */
describe("class hub tabs registry", () => {
  it("every CLASS_HUB_TABS id has an icon", () => {
    for (const id of CLASS_HUB_TABS) {
      expect(Object.hasOwn(TAB_ICONS, id), id).toBe(true)
    }
  })

  it("every TAB_ICONS entry is a shipped tab", () => {
    for (const id of Object.keys(TAB_ICONS)) {
      expect(CLASS_HUB_TABS, id).toContain(id)
    }
  })
})
