import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "./axe"

/**
 * F-ID-12 Part 1 (D-410): the public front door. Needs no database state, so
 * it runs on every e2e job at 360×800 and 1280×800 like the smoke suite.
 */
test.describe("front door", () => {
  test("says only what is live and is accessible", async ({
    page,
  }, testInfo) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", { level: 1, name: /run your school/i })
    ).toBeVisible()
    const main = page.getByRole("main")
    await expect(main).toContainText("works offline")
    await expect(main).toContainText("report cards")
    for (const unbuilt of [/bkash/i, /timetable/i, /messaging/i]) {
      await expect(main).not.toContainText(unbuilt)
    }

    // D-410 §1: the header lockup goes back to the main website.
    await expect(
      page.getByRole("link", { name: /acadigma campus, on acadigma\.com/i })
    ).toHaveAttribute("href", "https://acadigma.com")
    await expect(page.getByRole("link", { name: "Terms of Use" })).toBeVisible()

    await expectNoA11yViolations(page, testInfo)
  })

  test("device chooser switches tabs and never links to a store", async ({
    page,
  }) => {
    await page.goto("/")
    const chooser = page.locator("#get-the-app")
    // One filled action above the tabs; the store apps are never linked.
    await expect(
      chooser.getByRole("link", { name: "Open Campus" })
    ).toHaveAttribute("href", "/login")
    const tabs = chooser.getByRole("tab")
    await expect(tabs).toHaveCount(5)

    for (const [tab, text] of [
      ["iPhone", "Add to Home Screen"],
      ["Android", "Install app"],
      ["Windows", "Start menu"],
      ["Mac", "Add to Dock"],
    ] as const) {
      await chooser.getByRole("tab", { name: tab }).click()
      await expect(chooser.getByRole("tab", { name: tab })).toHaveAttribute(
        "aria-selected",
        "true"
      )
      const panel = chooser.getByRole("tabpanel")
      await expect(panel).toContainText(text)
      await expect(panel).toContainText("coming later")
      await expect(panel.getByRole("link")).toHaveCount(0)
    }

    await chooser.getByRole("tab", { name: "Web" }).click()
    await expect(chooser.getByRole("tabpanel")).toContainText("Sign in")
  })

  test("product links point to acadigma.com", async ({ page }) => {
    await page.goto("/")
    for (const product of ["campus", "parents", "students", "ledger"]) {
      await expect(
        page.getByRole("link", {
          name: new RegExp(`^About ${product} on acadigma\\.com`, "i"),
        })
      ).toHaveAttribute("href", `https://acadigma.com/${product}`)
    }
  })

  test("Create account reaches registration in the same look", async ({
    page,
  }, testInfo) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Create account" }).click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(
      page.getByRole("link", { name: "Acadigma Campus home" })
    ).toBeVisible()
    await expect(page.getByRole("contentinfo")).toContainText("Acadigma")
    await expectNoA11yViolations(page, testInfo)
  })
})

/** D-411: the website's motion, never at the cost of content or LCP. */
test.describe("front door motion", () => {
  test("headline paints at once, reveals run once on scroll, header floats", async ({
    page,
  }) => {
    await page.goto("/")
    const h1 = page.getByRole("heading", { level: 1 })
    // The LCP element is never hidden, not even for a frame of its entrance.
    await expect(h1).toHaveCSS("opacity", "1")
    await expect(h1).toHaveAccessibleName("Run your school from your phone.")

    // Cards below the fold wait off screen, then show once scrolled to.
    const card = page.locator("li.motion-reveal").last()
    await expect(card).toHaveAttribute("data-reveal", "pending")
    await card.scrollIntoViewIfNeeded()
    await expect(card).toHaveAttribute("data-reveal", "shown")
    await expect(card).toHaveCSS("opacity", "1")

    const header = page.locator("header").first()
    await expect(header).toHaveCSS("position", "sticky")
    await expect(header.locator(".motion-header-pill")).toHaveCSS(
      "opacity",
      "1"
    )
  })

  test("reduced motion: everything visible and still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await expect(page.locator("[data-reveal]")).toHaveCount(0)
    await expect(page.locator("header").first()).toHaveCSS("position", "static")
    for (const el of await page.locator(".motion-hero-rise").all()) {
      await expect(el).toHaveCSS("opacity", "1")
    }
    // The device word does not rotate.
    await page.waitForTimeout(3000)
    await expect(page.locator("h1 .inline-grid > span").first()).toBeVisible()
  })
})
