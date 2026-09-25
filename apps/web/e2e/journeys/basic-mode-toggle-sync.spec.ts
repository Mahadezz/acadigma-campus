import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-ID-10 Part 1 (D-403, D-404): text size and the basic-mode switch.
 * `docs/features/01-identity/F-ID-10-basic-mode.md` §10 names this journey
 * `basic-mode-toggle-sync`; §9 AC1/AC2/AC14 are what it proves. Runs at both
 * viewports (`playwright.config.ts` phone/desktop) with axe.
 *
 * Always leaves the seeded `owner@acadigma.test` account back at
 * ui_mode=full, text_size=normal in `afterEach` — the same "narrow the
 * contamination window on shared seeded state" rule `bn-locale-shell.spec.ts`
 * already follows for `profiles.locale`.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.afterEach(async ({ page }) => {
  if (!/\/app/.test(page.url())) return
  await page.goto("/app/settings/display")
  const basicSwitch = page.getByRole("switch", { name: "Basic mode" })
  if (await basicSwitch.isChecked().catch(() => false)) {
    await basicSwitch.click()
    await page.waitForURL(/\/app\/dashboard$/)
    await page.goto("/app/settings/display")
  }
  const normalCard = page.getByRole("radio", { name: /^Normal/ })
  if (!(await normalCard.isChecked().catch(() => true))) {
    await normalCard.click()
  }
})

test("changing text size applies immediately, survives a reload with no flash, and does not overflow at 360px", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/display")
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("radio", { name: /^Extra large/ }).click()
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "xlarge")
  await expectNoHorizontalScroll(page)

  // AC14: a fresh load already carries the preference — the server render,
  // not a client-side measurement after hydration. Checking the attribute
  // right after navigation (not after any client script has had time to run)
  // is what proves there was no flash at Normal first.
  await page.goto("/app/settings/display")
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "xlarge")
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page, testInfo)
})

test("turning on basic mode lands on /app/home, and a second browser context for the same account opens there too (AC1)", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/display")

  await page.getByRole("switch", { name: "Basic mode" }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
  await expect(page.getByRole("heading", { name: "Basic mode" })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page, testInfo)

  // A second, independent browser context (no shared cookie jar with the
  // first) — signing in fresh there must still land on /app/home, because
  // the preference is read from the stored row, not only this browser's
  // cookie.
  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  await signIn(secondPage, "owner@acadigma.test")
  await secondPage.goto("/app")
  await expect(secondPage).toHaveURL(/\/app\/home$/)
  await secondContext.close()
})

test("Switch to full app is one tap, no confirmation (AC2)", async ({
  page,
}) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/display")
  await page.getByRole("switch", { name: "Basic mode" }).click()
  await expect(page).toHaveURL(/\/app\/home$/)

  await page.getByRole("button", { name: "Switch to full app" }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
})
