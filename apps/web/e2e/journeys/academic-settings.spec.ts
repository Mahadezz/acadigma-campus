import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

/**
 * F-OP-07 Part 2 (D-210) §4 W3: the owner adds a second academic year, sees
 * the year-outside-range error naming a term that does not fit, then adds a
 * valid term. Both viewports via the phone/desktop projects.
 */
test("owner adds an academic year and a term, with the out-of-range error surfaced", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/academic")

  await page.getByRole("button", { name: "Add year" }).click()
  await page.getByLabel("Name").fill("2099")
  await page.getByLabel("Starts").fill("2099-01-01")
  await page.getByLabel("Ends").fill("2099-12-31")
  await page.getByRole("button", { name: "Save" }).click()
  // exact: the new year's dates line ("1 Jan 2099 – …") contains it too.
  await expect(page.getByText("2099", { exact: true })).toBeVisible()

  await page.getByRole("tab", { name: "Terms" }).click()
  await page.getByLabel("Academic year").selectOption({ label: "2099" })
  await page.getByRole("button", { name: "Add term" }).click()
  await page.getByLabel("Name").fill("Out of range")
  await page.getByLabel("Starts").fill("2098-12-01")
  await page.getByLabel("Ends").fill("2099-02-01")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(
    page.getByText("A term must fall inside its academic year.")
  ).toBeVisible()

  await page.getByLabel("Starts").fill("2099-01-01")
  await page.getByLabel("Ends").fill("2099-04-30")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Out of range", { exact: true })).toBeVisible()

  await expectNoA11yViolations(page, testInfo)
})

test("a teacher cannot open academic settings", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  const response = await page.goto("/app/settings/academic")
  expect(response?.status()).toBe(403)
})
