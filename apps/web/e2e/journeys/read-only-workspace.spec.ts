import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * D-300: a school whose trial has ended (`access_mode = read_only`, seeded as
 * "Acadigma Lapsed School", owner lapsed@acadigma.test) still signs in, still
 * reads (the audit viewer), and every screen explains the read-only state with
 * the same sentence a refused write returns. Both viewports via the
 * `phone`/`desktop` projects.
 */
test("a read-only school signs in, reads, and sees why it cannot write", async ({
  page,
}, testInfo) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill("lapsed@acadigma.test")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)

  const banner = page.getByText("This workspace is read-only")
  await expect(banner).toBeVisible()
  await expect(
    page.getByText(/Your Pro trial has ended\. Upgrade/)
  ).toBeVisible()
  await expect(page.getByText(/nothing has been deleted/)).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // Reads keep working: the owner's audit viewer loads, banner still shown.
  await page.goto("/app/audit")
  await expect(page).toHaveURL(/\/app\/audit/)
  await expect(banner).toBeVisible()
})
