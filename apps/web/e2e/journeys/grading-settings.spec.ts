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
 * F-AC-06 Part 1 demo: the owner seeds the Bangladesh scale (or finds it
 * already seeded) and the live preview maps 72 % to A (4.00); an invalid band
 * set is flagged before Save. Both viewports via the phone/desktop projects.
 */
test("owner seeds the BD scale and previews 72 % → A", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/grade-scale")

  const seed = page.getByRole("button", { name: "Use the Bangladesh default" })
  if (await seed.isVisible()) await seed.click()

  const preview = page.getByLabel("Try a percentage")
  await expect(preview).toBeVisible()
  await preview.fill("72")
  await expect(page.getByText("72 % → A (4.00)")).toBeVisible()
  await preview.fill("32.99")
  await expect(page.getByText("32.99 % → F (0.00)")).toBeVisible()

  // Break coverage: the F band now stops at 30.99 — flagged before saving.
  const fMax = page.getByLabel("To % (7)")
  await fMax.fill("30.99")
  await expect(page.getByText(/Nothing covers 31\.00 %/)).toBeVisible()
  await page.getByRole("button", { name: "Discard" }).click()

  await expectNoA11yViolations(page, testInfo)
})

test("a teacher cannot open grading settings", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  const response = await page.goto("/app/settings/grade-scale")
  expect(response?.status()).toBe(403)
})
