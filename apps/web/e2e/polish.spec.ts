import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "./axe"

/**
 * D-409 app polish, on the dev-only `/design` test bed (no login needed):
 * skeleton on a slow navigation, phone pull-to-refresh, optimistic rollback.
 * Runs at 360x800 (phone, touch) and 1280x800 (desktop).
 */
test.describe("app polish (D-409)", () => {
  test("skeleton shows during a slow navigation, then the page", async ({
    page,
  }, testInfo) => {
    await page.goto("/design")
    await expect(
      page.getByRole("heading", { name: "App polish" })
    ).toBeVisible()
    for (const v of ["list", "detail", "form"]) {
      await expect(
        page.locator(`[data-slot="page-skeleton"][data-variant="${v}"]`).first()
      ).toBeVisible()
    }
    await page.getByRole("link", { name: "Slow page (skeleton)" }).click()
    const sk = page.locator('[data-slot="page-skeleton"]')
    // The old page is gone and only the fallback skeleton is left.
    await expect(page.getByRole("heading", { name: "App polish" })).toBeHidden()
    await expect(sk).toHaveCount(1)
    await expect(sk).toHaveAttribute("aria-busy", "true")
    await page.screenshot({
      path: `test-results/polish-skeleton-${testInfo.project.name}.png`,
    })
    await expect(
      page.getByRole("heading", { name: "Slow page loaded" })
    ).toBeVisible()
    await expect(sk).toHaveCount(0)
  })

  test("optimistic toggle updates at once and rolls back on failure", async ({
    page,
  }, testInfo) => {
    await page.goto("/design")
    const sw = page.getByRole("switch", { name: "Demo setting" })
    await sw.click()
    // Before the 400 ms fake save answers: already on.
    await expect(sw).toHaveAttribute("aria-checked", "true")
    await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 2000 })
    // Now make the next save fail: it flips on, then snaps back with a toast.
    await page.getByLabel("Fail the next save").check()
    await sw.click()
    await expect(sw).toHaveAttribute("aria-checked", "false")
    await expect(page.getByText("Could not save. Try again.")).toBeVisible()
    await expect(sw).toHaveAttribute("aria-checked", "true")
    await page.screenshot({
      path: `test-results/polish-optimistic-${testInfo.project.name}.png`,
    })
  })

  test("pull down at the top refreshes on a phone, not on desktop", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "CDP touch input")
    await page.goto("/design")
    await expect(
      page.getByRole("heading", { name: "App polish" })
    ).toBeVisible()
    const isPhone = testInfo.project.name === "phone"
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: string, y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x: 180, y }],
      })
    const pull = async (to: number) => {
      await touch("touchStart", 300)
      for (let y = 300; y <= to; y += 20) await touch("touchMove", y)
      await touch("touchEnd", to)
    }
    const rsc = (r: { url(): string }) => r.url().includes("_rsc=")

    // Too short: nothing.
    let seen = 0
    page.on("request", (r) => rsc(r) && seen++)
    await pull(340)
    await page.waitForTimeout(500)
    expect(seen).toBe(0)

    // Past 64px of damped travel (128px of finger): a refresh on phone only.
    const req = isPhone
      ? page.waitForRequest(rsc, { timeout: 5000 })
      : Promise.resolve(null)
    await pull(300 + 160)
    if (isPhone) {
      await req
      await page.screenshot({
        path: `test-results/polish-pull-${testInfo.project.name}.png`,
      })
    } else {
      await page.waitForTimeout(500)
      expect(seen).toBe(0)
    }
    await expectNoA11yViolations(page, testInfo)
  })
})
